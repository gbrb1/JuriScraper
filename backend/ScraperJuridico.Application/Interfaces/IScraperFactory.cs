namespace ScraperJuridico.Application.Interfaces;

public interface IScraperFactory
{
    IScraperService ObterScraper(string numeroProcesso);
}