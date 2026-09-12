namespace ScraperJuridico.Domain.Entities;

public class ParteProcesso
{
    public int Id { get; set; }
    public string ProcessoNumeroProcesso { get; set; } = string.Empty;
    public string Tribunal { get; set; } = string.Empty;
    public string Tipo { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
    public Processo? Processo { get; set; }
}