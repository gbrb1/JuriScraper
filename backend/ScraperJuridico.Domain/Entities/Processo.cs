namespace ScraperJuridico.Domain.Entities;

public class Processo
{
    public string NumeroProcesso { get; set; } = string.Empty;
    public string Tribunal { get; set; } = string.Empty;
    public string Classe { get; set; } = string.Empty;
    public string Assunto { get; set; } = string.Empty;
    public string Foro { get; set; } = string.Empty;
    public DateTime? DataDistribuicao { get; set; }
    public string UltimoAndamento { get; set; } = string.Empty;
    public DateTime? DataUltimoAndamento { get; set; }
    public List<ParteProcesso> Partes { get; set; } = new();
}