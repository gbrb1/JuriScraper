namespace ScraperJuridico.Application.Dtos;

public record ResultadoColetaDto(
    string NumeroProcesso,
    bool Sucesso,
    string Mensagem,
    ProcessoDto? Processo = null
);