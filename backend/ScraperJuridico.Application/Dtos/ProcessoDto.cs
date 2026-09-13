namespace ScraperJuridico.Application.Dtos;

public record ParteDto(string Tipo, string Nome);

public record ProcessoDto(
    string NumeroProcesso,
    string Tribunal,
    int Grau,
    string Classe,
    string Assunto,
    string Foro,
    DateTime? DataDistribuicao,
    string UltimoAndamento,
    DateTime? DataUltimoAndamento,
    List<ParteDto> Partes
);