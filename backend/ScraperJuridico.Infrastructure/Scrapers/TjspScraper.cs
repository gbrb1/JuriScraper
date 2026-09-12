using Microsoft.Playwright;
using ScraperJuridico.Application.Interfaces;
using ScraperJuridico.Domain.Entities;
using System.Globalization;
using System.Text.RegularExpressions;

namespace ScraperJuridico.Infrastructure.Scrapers;

public class TjspScraper : IScraperService
{
    public bool SuportaTribunal(string numeroProcesso)
    {
        return numeroProcesso.Contains(".8.26.");
    }

    public async Task<Processo> ExtrairProcessoAsync(string numeroProcesso, CancellationToken cancellationToken = default)
    {
        using var playwright = await Playwright.CreateAsync();

        await using var browser = await playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
        {
            Headless = true
        });

        // fecha o navegador se o usuário cancelar no front
        using var registration = cancellationToken.Register(async () =>
        {
            try
            {
                if (browser != null) await browser.CloseAsync();
            }
            catch { }
        });

        var context = await browser.NewContextAsync();
        var page = await context.NewPageAsync();

        var apenasDigitos = Regex.Replace(numeroProcesso, @"\D", "");
        if (apenasDigitos.Length != 20)
        {
            throw new ArgumentException($"Número de processo inválido: {numeroProcesso}");
        }

        var numeroDigitoAno = apenasDigitos.Substring(0, 13);
        var foro = apenasDigitos.Substring(16, 4);

        await page.GotoAsync("https://esaj.tjsp.jus.br/cpopg/open.do", new() { Timeout = 30000 });

        cancellationToken.ThrowIfCancellationRequested();

        await page.WaitForSelectorAsync("#numeroDigitoAnoUnificado");
        await page.FillAsync("#numeroDigitoAnoUnificado", numeroDigitoAno);
        await page.FillAsync("#foroNumeroUnificado", foro);

        var waitPageTask = context.WaitForPageAsync();
        await page.ClickAsync("#botaoConsultarProcessos");

        var pageResult = await Task.WhenAny(waitPageTask, Task.Delay(2500, cancellationToken)) == waitPageTask
            ? await waitPageTask
            : page;

        cancellationToken.ThrowIfCancellationRequested();

        await pageResult.WaitForLoadStateAsync(LoadState.DOMContentLoaded);

        if (await pageResult.Locator("#uuidCaptcha").IsVisibleAsync())
        {
            throw new InvalidOperationException("CAPTCHA detectado no portal TJSP.");
        }

        if (await pageResult.Locator("#mensagemRetorno").IsVisibleAsync())
        {
            var msg = (await pageResult.Locator("#mensagemRetorno").InnerTextAsync()).Trim();
            throw new Exception($"TJSP: {msg}");
        }

        var processo = new Processo
        {
            NumeroProcesso = numeroProcesso,
            Tribunal = "TJ-SP",
            Classe = await ObterTextoAsync(pageResult, "#classeProcesso"),
            Assunto = await ObterTextoAsync(pageResult, "#assuntoProcesso"),
            Foro = await ObterTextoAsync(pageResult, "#foroProcesso")
        };

        var btnExpandir = pageResult.Locator("#botaoExpandirDadosSecundarios");
        if (await btnExpandir.IsVisibleAsync())
        {
            await btnExpandir.ClickAsync();
        }

        var textoDist = await ObterTextoAsync(pageResult, "#dataHoraDistribuicaoProcesso");
        var matchData = Regex.Match(textoDist, @"\b\d{2}/\d{2}/\d{4}(?:\s+(?:às\s+)?\d{2}:\d{2}(?::\d{2})?)?\b");
        if (matchData.Success)
        {
            var valorDataHora = Regex.Replace(matchData.Value, @"\s+às\s+", " ").Trim();
            string[] formatos = ["dd/MM/yyyy HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy"];

            if (DateTime.TryParseExact(valorDataHora, formatos, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dataDist))
            {
                processo.DataDistribuicao = dataDist;
            }
        }

        var linhasPartes = await pageResult.Locator("#tablePartesPrincipais tr").AllAsync();
        foreach (var linha in linhasPartes)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var celulaTipo = linha.Locator("td").First;
            var celulaConteudo = linha.Locator("td").Last;

            if (await celulaTipo.CountAsync() == 0 || await celulaConteudo.CountAsync() == 0)
                continue;

            var tipoBruto = (await celulaTipo.InnerTextAsync()).Replace("&nbsp;", "").Trim(':', ' ', '\r', '\n');
            var textoConteudo = await celulaConteudo.InnerTextAsync();

            var linhasTexto = textoConteudo
                .Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim())
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .ToList();

            if (linhasTexto.Count == 0) continue;

            var nomePrincipal = linhasTexto[0];
            processo.Partes.Add(new ParteProcesso
            {
                Tipo = string.IsNullOrWhiteSpace(tipoBruto) ? "Parte" : tipoBruto,
                Nome = nomePrincipal
            });

            for (int i = 1; i < linhasTexto.Count; i++)
            {
                var linhaSub = linhasTexto[i];
                var matchAdv = Regex.Match(linhaSub, @"^(Advogad[oa]|Defensor[a]?)\s*:\s*(.*)$", RegexOptions.IgnoreCase);

                if (matchAdv.Success)
                {
                    processo.Partes.Add(new ParteProcesso
                    {
                        Tipo = matchAdv.Groups[1].Value.Trim(),
                        Nome = matchAdv.Groups[2].Value.Trim()
                    });
                }
            }
        }

        try
        {
            var btnExibir = pageResult.Locator("#btnExibirMovimentacoes, a:has-text('Exibir movimentações')").First;
            if (await btnExibir.IsVisibleAsync())
            {
                await btnExibir.ClickAsync();
                await Task.Delay(600, cancellationToken);
            }

            var linhaMov = pageResult.Locator("#tabelaPrimeiraPaginaMovimentacoes tr.containerMovimentacao, #tabelaTodasMovimentacoes tr.containerMovimentacao, #containerMovimentacoes tr.containerMovimentacao, tr.containerMovimentacao").First;

            if (await linhaMov.IsVisibleAsync())
            {
                var celulaData = linhaMov.Locator("td.dataMovimentacao, td:first-child").First;
                var celulaDesc = linhaMov.Locator("td.descricaoMovimentacao, td:last-child").First;

                var txtData = (await celulaData.InnerTextAsync()).Trim();
                var txtDesc = (await celulaDesc.InnerTextAsync()).Trim();

                var matchDataMov = Regex.Match(txtData, @"\b\d{2}/\d{2}/\d{4}(?:\s+(?:às\s+)?\d{2}:\d{2}(?::\d{2})?)?\b");
                if (matchDataMov.Success)
                {
                    var valorLimpo = Regex.Replace(matchDataMov.Value, @"\s+às\s+", " ").Trim();
                    string[] formatos = ["dd/MM/yyyy HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy"];

                    if (DateTime.TryParseExact(valorLimpo, formatos, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dtMov))
                    {
                        processo.DataUltimoAndamento = dtMov;
                    }
                }

                processo.UltimoAndamento = Regex.Replace(txtDesc, @"\s+", " ").Trim();
            }
        }
        catch
        {
        }

        if (string.IsNullOrWhiteSpace(processo.UltimoAndamento))
        {
            processo.UltimoAndamento = "Processo sem movimentações públicas recentes.";
            processo.DataUltimoAndamento = processo.DataDistribuicao;
        }

        return processo;
    }

    private static async Task<string> ObterTextoAsync(IPage page, string seletor)
    {
        var loc = page.Locator(seletor).First;
        return await loc.CountAsync() > 0 ? (await loc.InnerTextAsync()).Trim() : string.Empty;
    }
}