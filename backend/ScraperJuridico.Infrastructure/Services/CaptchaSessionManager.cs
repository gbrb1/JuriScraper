using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace ScraperJuridico.Infrastructure.Services;

public class OpcaoProcessoDto
{
    public int Indice { get; set; }
    public string Texto { get; set; } = string.Empty;
}

public class CaptchaSessionManager
{
    private class SolicitacaoSessao
    {
        // escolha de Grau
        public List<OpcaoProcessoDto> OpcoesGrau { get; set; } = new();
        public TaskCompletionSource<int> TcsEscolhaGrau { get; set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        // CAPTCHA
        public string ImagemBase64 { get; set; } = string.Empty;
        public string HashImagem { get; set; } = string.Empty;
        public bool HouveErroValidacao { get; set; } = false;
        public string? MensagemErro { get; set; } = null;
        public int VersaoTentativa { get; set; } = 0; // incrementador p o front detectar nova tentativa mesmo com o mesmo hash
        public TaskCompletionSource<string> TcsCaptcha { get; set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    private readonly ConcurrentDictionary<string, SolicitacaoSessao> _sessoes = new();

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

    public void AtualizarImagem(string sessionId, byte[] imagemBytes, bool houveErro, string? mensagemErro = null)
    {
        var novoHash = CalcularHash(imagemBytes);
        var sessao = _sessoes.GetOrAdd(sessionId, _ => new SolicitacaoSessao());

        sessao.ImagemBase64 = Convert.ToBase64String(imagemBytes);
        sessao.HashImagem = novoHash;
        sessao.HouveErroValidacao = houveErro;
        sessao.MensagemErro = mensagemErro;
        sessao.VersaoTentativa++;
    }

    public async Task<string> AguardarRespostaCaptchaAsync(string sessionId, TimeSpan timeout)
    {
        if (!_sessoes.TryGetValue(sessionId, out var sessao))
        {
            throw new InvalidOperationException($"Sessão {sessionId} não encontrada.");
        }

        sessao.TcsCaptcha = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);

        using var cts = new CancellationTokenSource(timeout);
        using var reg = cts.Token.Register(() => sessao.TcsCaptcha.TrySetCanceled());

        return await sessao.TcsCaptcha.Task;
    }

    public (string? ImagemBase64, string Hash, bool HouveErro, string? MensagemErro, int Versao) ObterDadosCaptcha(string sessionId)
    {
        if (_sessoes.TryGetValue(sessionId, out var sessao))
        {
            return (sessao.ImagemBase64, sessao.HashImagem, sessao.HouveErroValidacao, sessao.MensagemErro, sessao.VersaoTentativa);
        }
        return (null, string.Empty, false, null, 0);
    }

    public bool ResponderCaptcha(string sessionId, string respostaTexto)
    {
        if (_sessoes.TryGetValue(sessionId, out var sessao))
        {
            return sessao.TcsCaptcha.TrySetResult(respostaTexto);
        }
        return false;
    }

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