using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace ScraperJuridico.Infrastructure.Services;

public class OpcaoProcessoDto
{
    public int Indice { get; set; }
    public string Texto { get; set; } = string.Empty;
}

public class StatusCaptchaDto
{
    public int Tentativa { get; set; }
    public int Max { get; set; }
}

public class CaptchaSessionManager
{
    private class SolicitacaoSessao
    {
        // Escolha de Grau
        public List<OpcaoProcessoDto> OpcoesGrau { get; set; } = new();
        public TaskCompletionSource<int> TcsEscolhaGrau { get; set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        // Status das Tentativas Automáticas (para exibição no front-end)
        public int TentativaAtual { get; set; } = 0;
        public int MaxTentativas { get; set; } = 10;
    }

    private readonly ConcurrentDictionary<string, SolicitacaoSessao> _sessoes = new();

    // ================= STATUS DAS TENTATIVAS AUTOMÁTICAS =================

    public void AtualizarTentativa(string sessionId, int tentativa, int max = 10)
    {
        var sessao = _sessoes.GetOrAdd(sessionId, _ => new SolicitacaoSessao());
        sessao.TentativaAtual = tentativa;
        sessao.MaxTentativas = max;
    }

    public StatusCaptchaDto? ObterStatusTentativa(string sessionId)
    {
        if (_sessoes.TryGetValue(sessionId, out var sessao) && sessao.TentativaAtual > 0)
        {
            return new StatusCaptchaDto
            {
                Tentativa = sessao.TentativaAtual,
                Max = sessao.MaxTentativas
            };
        }
        return null;
    }

    public void LimparStatusTentativa(string sessionId)
    {
        if (_sessoes.TryGetValue(sessionId, out var sessao))
        {
            sessao.TentativaAtual = 0;
        }
    }

    // ================= FLUXO DE ESCOLHA DE GRAU =================

    public async Task<int> AguardarEscolhaGrauAsync(string sessionId, List<OpcaoProcessoDto> opcoes, TimeSpan timeout)
    {
        var sessao = _sessoes.GetOrAdd(sessionId, _ => new SolicitacaoSessao());
        sessao.OpcoesGrau = opcoes;
        sessao.TcsEscolhaGrau = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);

        using var cts = new CancellationTokenSource(timeout);
        using var reg = cts.Token.Register(() => sessao.TcsEscolhaGrau.TrySetCanceled());

        return await sessao.TcsEscolhaGrau.Task;
    }

    public List<OpcaoProcessoDto> ObterOpcoesGrau(string sessionId)
    {
        return _sessoes.TryGetValue(sessionId, out var sessao) ? sessao.OpcoesGrau : new List<OpcaoProcessoDto>();
    }

    public bool SelecionarGrau(string sessionId, int indice)
    {
        if (_sessoes.TryGetValue(sessionId, out var sessao))
        {
            sessao.OpcoesGrau.Clear();
            return sessao.TcsEscolhaGrau.TrySetResult(indice);
        }
        return false;
    }

    // ================= CICLO DE VIDA E UTILITÁRIOS =================

    public void FinalizarSessao(string sessionId)
    {
        _sessoes.TryRemove(sessionId, out _);
    }

    public static string CalcularHash(byte[] bytes)
    {
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash);
    }
}