using Microsoft.Extensions.Logging;
using Microsoft.Playwright;
using ScraperJuridico.Application.Interfaces;
using ScraperJuridico.Domain.Entities;
using ScraperJuridico.Infrastructure.Services;
using System.Globalization;
using System.Text.RegularExpressions;

namespace ScraperJuridico.Infrastructure.Scrapers;

public class PjeTrtScraper : IScraperService
{
    private static readonly Dictionary<string, string> SubdominiosTrt = new()
    {
        { "15", "pje.trt15.jus.br" },
        { "02", "pje.trt2.jus.br" },
        { "2",  "pje.trt2.jus.br" },
        { "12", "pje.trt12.jus.br" },
        { "04", "pje.trt4.jus.br" },
        { "4",  "pje.trt4.jus.br" }
    };

    private readonly ILogger<PjeTrtScraper> _logger;
    private readonly CaptchaSessionManager _sessionManager;

    public PjeTrtScraper(ILogger<PjeTrtScraper> logger, CaptchaSessionManager sessionManager)
    {
        _logger = logger;
        _sessionManager = sessionManager;
    }

    public bool SuportaTribunal(string numeroProcesso)
    {
        return Regex.IsMatch(numeroProcesso, @"\.5\.(0?[24]|12|15)\.");
    }

    public async Task<Processo> ExtrairProcessoAsync(string numeroProcesso, CancellationToken cancellationToken = default)
    {
        var matchTrt = Regex.Match(numeroProcesso, @"\.5\.(?<trt>0?[24]|12|15)\.");
        if (!matchTrt.Success)
        {
            throw new NotSupportedException($"TRT não suportado: {numeroProcesso}");
        }

        var trtCodigo = matchTrt.Groups["trt"].Value;
        var subdominio = SubdominiosTrt[trtCodigo];
        var apenasDigitos = Regex.Replace(numeroProcesso, @"\D", "");

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

        var context = await browser.NewContextAsync(new()
        {
            UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            ViewportSize = new ViewportSize { Width = 1366, Height = 768 },
            Locale = "pt-BR"
        });
        var page = await context.NewPageAsync();
        await page.AddInitScriptAsync("Object.defineProperty(navigator, 'webdriver', { get: () => undefined })");

        var urlConsulta = $"https://{subdominio}/consultaprocessual/detalhe-processo/{apenasDigitos}";
        _logger.LogInformation("[PJE TRT-{Trt}] Navegando para {Url}", trtCodigo, urlConsulta);

        await page.GotoAsync(urlConsulta, new PageGotoOptions { Timeout = 45000 });

        cancellationToken.ThrowIfCancellationRequested();

        // verificação de tribunal indisponível
        var telaIndisponivel = page.Locator("text=Sistema temporariamente indisponível").First;
        try
        {
            await telaIndisponivel.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 2000
            });

            _logger.LogWarning("[PJE TRT-{Trt}] Tribunal em manutenção ou indisponível.", trtCodigo);
            throw new HttpRequestException($"Tribunal TRT-{trtCodigo} temporariamente indisponível.");
        }
        catch (TimeoutException)
        {
        }

        // verificação imediata se o processo já abriu com erro (#painel-erro)
        var painelErroInicial = page.Locator("#painel-erro").First;
        try
        {
            await painelErroInicial.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 2500
            });

            if (await painelErroInicial.IsVisibleAsync())
            {
                var txtErro = await painelErroInicial.Locator("span").InnerTextAsync();
                var msgFinal = string.IsNullOrWhiteSpace(txtErro)
                    ? "Ocorreu um erro ao consultar o processo no tribunal."
                    : txtErro.Trim();

                _logger.LogWarning("[PJE TRT-{Trt}] Processo inexistente ou inválido detectado de início (#painel-erro): '{Msg}'", trtCodigo, msgFinal);
                throw new KeyNotFoundException(msgFinal);
            }
        }
        catch (TimeoutException)
        {
        }

        try
        {
            // tela de escolha de instância (1/2 grau)
            var painelEscolha = page.Locator("#painel-escolha-processo").First;
            try
            {
                await painelEscolha.WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 4000
                });
            }
            catch (TimeoutException)
            {
            }

            if (await painelEscolha.IsVisibleAsync())
            {
                _logger.LogInformation("[PJE TRT-{Trt}] Múltiplos graus encontrados (#painel-escolha-processo). Coletando opções...", trtCodigo);

                var botoesLocator = page.Locator("#painel-escolha-processo button.selecao-processo");
                int totalBotoes = await botoesLocator.CountAsync();
                var opcoes = new List<OpcaoProcessoDto>();

                for (int i = 0; i < totalBotoes; i++)
                {
                    var textoBotao = (await botoesLocator.Nth(i).InnerTextAsync()).Replace("\r", " ").Replace("\n", " - ").Trim();
                    opcoes.Add(new OpcaoProcessoDto { Indice = i, Texto = textoBotao });
                }

                _logger.LogInformation("[PJE TRT-{Trt}] Aguardando operador escolher o grau no front-end...", trtCodigo);

                int indiceEscolhido = await _sessionManager.AguardarEscolhaGrauAsync(apenasDigitos, opcoes, TimeSpan.FromMinutes(2));

                cancellationToken.ThrowIfCancellationRequested();

                _logger.LogInformation("[PJE TRT-{Trt}] Clicando no grau selecionado: índice {Indice}", trtCodigo, indiceEscolhido);

                var waitNovaAbaTask = context.WaitForPageAsync(new BrowserContextWaitForPageOptions { Timeout = 4000 });
                await page.Locator("#painel-escolha-processo button.selecao-processo").Nth(indiceEscolhido).ClickAsync();

                try
                {
                    var novaAba = await waitNovaAbaTask;
                    if (novaAba != null)
                    {
                        _logger.LogInformation("[PJE TRT-{Trt}] Processo abriu em nova aba. Alternando contexto...", trtCodigo);
                        page = novaAba;
                        await page.WaitForLoadStateAsync(LoadState.DOMContentLoaded);
                    }
                }
                catch (TimeoutException)
                {
                    _logger.LogInformation("[PJE TRT-{Trt}] Navegação permaneceu na mesma aba.", trtCodigo);
                }

                await page.WaitForLoadStateAsync(LoadState.DOMContentLoaded);
                await Task.Delay(1500, cancellationToken);
            }

            // detecção e resolução de CAPTCHA
            var imgCaptcha = page.Locator("#imagemCaptcha").First;
            const int maxTentativas = 5;
            int tentativaAtual = 0;
            bool erroAnterior = false;
            string? mensagemErroAlerta = null;

            while (tentativaAtual < maxTentativas)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var visivel = await imgCaptcha.IsVisibleAsync();
                if (!visivel && tentativaAtual == 0)
                {
                    try
                    {
                        await imgCaptcha.WaitForAsync(new LocatorWaitForOptions
                        {
                            State = WaitForSelectorState.Visible,
                            Timeout = 5000
                        });
                        visivel = true;
                    }
                    catch (TimeoutException)
                    {
                        _logger.LogInformation("[PJE TRT-{Trt}] Nenhum CAPTCHA exigido. Prosseguindo...", trtCodigo);
                        break;
                    }
                }

                if (!visivel)
                {
                    _logger.LogInformation("[PJE TRT-{Trt}] CAPTCHA superado!", trtCodigo);
                    break;
                }

                tentativaAtual++;
                _logger.LogInformation("[PJE TRT-{Trt}] Ciclo CAPTCHA (Tentativa {Tentativa}/{Max})...", trtCodigo, tentativaAtual, maxTentativas);

                await Task.Delay(400, cancellationToken);
                var imagemBytes = await imgCaptcha.ScreenshotAsync();

                _sessionManager.AtualizarImagem(apenasDigitos, imagemBytes, erroAnterior, mensagemErroAlerta);

                using var ctsMonitor = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                var monitorTask = Task.Run(async () =>
                {
                    string ultimoHash = CaptchaSessionManager.CalcularHash(imagemBytes);
                    while (!ctsMonitor.Token.IsCancellationRequested)
                    {
                        try
                        {
                            await Task.Delay(1200, ctsMonitor.Token);
                            if (await imgCaptcha.IsVisibleAsync())
                            {
                                var bytesAtuais = await imgCaptcha.ScreenshotAsync();
                                var hashAtual = CaptchaSessionManager.CalcularHash(bytesAtuais);

                                if (hashAtual != ultimoHash)
                                {
                                    _logger.LogInformation("[PJE TRT-{Trt}] Imagem atualizou no portal. Atualizando front...", trtCodigo);
                                    ultimoHash = hashAtual;
                                    _sessionManager.AtualizarImagem(apenasDigitos, bytesAtuais, houveErro: false, mensagemErro: null);
                                }
                            }
                        }
                        catch
                        {
                        }
                    }
                }, ctsMonitor.Token);

                string textoDigitado;
                try
                {
                    textoDigitado = await _sessionManager.AguardarRespostaCaptchaAsync(apenasDigitos, TimeSpan.FromMinutes(2));
                }
                finally
                {
                    ctsMonitor.Cancel();
                }

                cancellationToken.ThrowIfCancellationRequested();

                _logger.LogInformation("[PJE TRT-{Trt}] Preenchendo resposta: '{Texto}'", trtCodigo, textoDigitado);

                var inputCaptcha = page.Locator("#captchaInput");
                await inputCaptcha.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 3000 });
                await inputCaptcha.FillAsync("");
                await inputCaptcha.FillAsync(textoDigitado);

                var btnEnviar = page.Locator("button:has-text('ENVIAR'), button[type='submit'], mat-dialog-container button[type='submit']").First;
                if (await btnEnviar.IsVisibleAsync())
                {
                    await btnEnviar.ClickAsync();
                }

                string textoSnack = string.Empty;
                try
                {
                    var snackBar = page.Locator("snack-bar-container, simple-snack-bar, .mat-snack-bar-container, mat-error").First;
                    await snackBar.WaitForAsync(new LocatorWaitForOptions
                    {
                        State = WaitForSelectorState.Visible,
                        Timeout = 1500
                    });

                    var rawText = await snackBar.InnerTextAsync();
                    textoSnack = rawText.Replace("Fechar", "").Replace("FECHAR", "").Trim();
                    _logger.LogWarning("[PJE TRT-{Trt}] Mensagem interceptada: '{Texto}'", trtCodigo, textoSnack);
                }
                catch (TimeoutException)
                {
                }

                await Task.Delay(800, cancellationToken);

                if (await imgCaptcha.IsVisibleAsync())
                {
                    mensagemErroAlerta = !string.IsNullOrWhiteSpace(textoSnack)
                        ? textoSnack
                        : "Os caracteres informados estão inválidos. Tente novamente.";

                    _logger.LogWarning("[PJE TRT-{Trt}] CAPTCHA rejeitado: '{Motivo}'.", trtCodigo, mensagemErroAlerta);
                    erroAnterior = true;
                }
                else
                {
                    _logger.LogInformation("[PJE TRT-{Trt}] CAPTCHA validado com êxito!", trtCodigo);
                    break;
                }
            }

            if (tentativaAtual >= maxTentativas && await imgCaptcha.IsVisibleAsync())
            {
                throw new InvalidOperationException("Limite de tentativas de resolução do CAPTCHA excedido.");
            }
        }
        finally
        {
            _sessionManager.FinalizarSessao(apenasDigitos);
        }

        // aguarda renderização do processo ou surgimento do erro pós-consulta/captcha
        await page.WaitForLoadStateAsync(LoadState.DOMContentLoaded);
        await Task.Delay(2500, cancellationToken);

        // verificação do painel de erro (#painel-erro) caso o tribunal falhe ao localizar o processo
        var painelErro = page.Locator("#painel-erro").First;
        if (await painelErro.IsVisibleAsync())
        {
            var txtErro = await painelErro.Locator("span").InnerTextAsync();
            var msgFinal = string.IsNullOrWhiteSpace(txtErro)
                ? "Ocorreu um erro ao consultar o processo!"
                : txtErro.Trim();

            _logger.LogWarning("[PJE TRT-{Trt}] Processo inexistente (#painel-erro): '{Msg}'", trtCodigo, msgFinal);
            throw new KeyNotFoundException(msgFinal);
        }

        var processo = new Processo
        {
            NumeroProcesso = numeroProcesso,
            Tribunal = $"TRT-{int.Parse(trtCodigo)}"
        };

        var textoTodoCorpo = await page.InnerTextAsync("body");

        var matchCabecalho = Regex.Match(textoTodoCorpo, @"(?<classe>[A-Z][A-Za-z0-9]+)\s+" + Regex.Escape(numeroProcesso) + @"\s*\((?<foro>[^)]+)\)");
        if (matchCabecalho.Success)
        {
            processo.Classe = matchCabecalho.Groups["classe"].Value.Trim();
            processo.Foro = matchCabecalho.Groups["foro"].Value.Trim();
        }

        if (string.IsNullOrWhiteSpace(processo.Classe))
        {
            var matchClasseDoc = Regex.Match(textoTodoCorpo, @"\b(?<classe>ATOrd|ATSum|ROT|ACum|ExProvAS|Reclm)\b", RegexOptions.IgnoreCase);
            if (matchClasseDoc.Success)
            {
                processo.Classe = matchClasseDoc.Groups["classe"].Value.ToUpper();
            }
        }

        var matchOrgaoOrigem = Regex.Match(textoTodoCorpo, @"Órgão Julgador de Origem:\s*(?<orgao>[^\r\n]+)", RegexOptions.IgnoreCase);
        if (matchOrgaoOrigem.Success && string.IsNullOrWhiteSpace(processo.Foro))
        {
            processo.Foro = matchOrgaoOrigem.Groups["orgao"].Value.Trim();
        }

        var matchAutor = Regex.Match(textoTodoCorpo, @"AUTOR:\s*(?<nome>[^\r\n]+)", RegexOptions.IgnoreCase);
        if (matchAutor.Success)
        {
            processo.Partes.Add(new ParteProcesso { Tipo = "Autor", Nome = matchAutor.Groups["nome"].Value.Trim() });
        }

        var matchReu = Regex.Match(textoTodoCorpo, @"RÉU:\s*(?<nome>[^\r\n]+)", RegexOptions.IgnoreCase);
        if (matchReu.Success)
        {
            processo.Partes.Add(new ParteProcesso { Tipo = "Réu", Nome = matchReu.Groups["nome"].Value.Trim() });
        }

        if (processo.Partes.Count == 0)
        {
            try
            {
                var matchPolos = Regex.Match(textoTodoCorpo, @"(?<ativo>[A-Z\.\s]+(?:e outros)?)\s+[xX]\s+(?<passivo>[^\r\n]+)");
                if (matchPolos.Success)
                {
                    var poloAtivo = matchPolos.Groups["ativo"].Value.Trim();
                    var poloPassivo = matchPolos.Groups["passivo"].Value.Trim();

                    if (!poloAtivo.Contains("TRT") && !poloPassivo.Contains("TRT") && poloAtivo != poloPassivo)
                    {
                        processo.Partes.Add(new ParteProcesso { Tipo = "Polo Ativo", Nome = poloAtivo });
                        processo.Partes.Add(new ParteProcesso { Tipo = "Polo Passivo", Nome = poloPassivo });
                    }
                }
            }
            catch
            {
            }
        }

        var matchDataDist = Regex.Match(textoTodoCorpo, @"\b(?<data>\d{2}/\d{2}/\d{4}(?:\s+(?:às\s+)?\d{2}:\d{2}(?::\d{2})?)?)\b");
        if (matchDataDist.Success)
        {
            var valorDataHora = Regex.Replace(matchDataDist.Groups["data"].Value, @"\s+às\s+", " ").Trim();
            string[] formatos = ["dd/MM/yyyy HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy"];

            if (DateTime.TryParseExact(valorDataHora, formatos, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dtDist))
            {
                processo.DataDistribuicao = dtDist;
            }
        }

        var matchAssunto = Regex.Match(textoTodoCorpo, @"Assunto:\s*(?<assunto>[^\r\n]+)", RegexOptions.IgnoreCase);
        if (matchAssunto.Success)
        {
            processo.Assunto = matchAssunto.Groups["assunto"].Value.Trim();
        }
        else
        {
            processo.Assunto = "Direito do Trabalho / Rescisão do Contrato";
        }

        // extração da última movimentação, alternando para visualização em tabela e iterando 'tr.timeline-row'
        try
        {
            var btnTabela = page.Locator("button[aria-label='Visualizar em Tabela'], button[accesskey='n']").First;
            if (await btnTabela.IsVisibleAsync())
            {
                _logger.LogInformation("[PJE TRT-{Trt}] Clicando no botão 'Visualizar em Tabela'...", trtCodigo);
                await btnTabela.ClickAsync();
                await page.WaitForSelectorAsync("tr.timeline-row", new() { Timeout = 4000 });
                await Task.Delay(500, cancellationToken);
            }

            var linhasTabela = await page.Locator("tr.timeline-row").AllAsync();
            foreach (var linha in linhasTabela)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var celulaTipo = linha.Locator("td.timeline-cell[aria-label='Movimento'], td:has-text('Movimento')");
                if (await celulaTipo.CountAsync() == 0) continue;

                var celulaData = linha.Locator("td.timeline-cell").First;
                var txtData = (await celulaData.InnerTextAsync()).Trim();
                var matchData = Regex.Match(txtData, @"\b\d{2}/\d{2}/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\b");

                if (matchData.Success)
                {
                    string[] formatos = ["dd/MM/yyyy HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy"];
                    if (DateTime.TryParseExact(matchData.Value.Trim(), formatos, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dtMov))
                    {
                        processo.DataUltimoAndamento = dtMov;
                    }
                }

                var descSpan = linha.Locator("span.tl-item-desc").First;
                if (await descSpan.CountAsync() > 0)
                {
                    var txtDesc = (await descSpan.InnerTextAsync()).Trim();
                    processo.UltimoAndamento = Regex.Replace(txtDesc, @"\s+", " ");
                }
                else
                {
                    var celulas = await linha.Locator("td.timeline-cell").AllAsync();
                    if (celulas.Count >= 4)
                    {
                        var txtDesc = (await celulas[3].InnerTextAsync()).Trim();
                        processo.UltimoAndamento = Regex.Replace(txtDesc, @"\s+", " ");
                    }
                }

                break;
            }

            if (string.IsNullOrWhiteSpace(processo.UltimoAndamento))
            {
                processo.UltimoAndamento = string.Empty;
                processo.DataUltimoAndamento = processo.DataDistribuicao;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[PJE TRT-{Trt}] Falha ao iterar pela tabela de movimentações.", trtCodigo);
        }

        _logger.LogInformation("[PJE TRT-{Trt}] Extração concluída: {Num} | Data Mov: {DataMov} | Movimento: '{Mov}'",
            trtCodigo, numeroProcesso, processo.DataUltimoAndamento?.ToString("dd/MM/yyyy"), processo.UltimoAndamento);

        return processo;
    }
}