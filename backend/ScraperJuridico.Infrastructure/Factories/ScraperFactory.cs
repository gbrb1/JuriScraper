using ScraperJuridico.Application.Interfaces;

namespace ScraperJuridico.Infrastructure.Factories;

public class ScraperFactory : IScraperFactory
{
    private readonly IEnumerable<IScraperService> _scrapers;

    public ScraperFactory(IEnumerable<IScraperService> scrapers)
    {
        _scrapers = scrapers;
    }

    public IScraperService ObterScraper(string numeroProcesso)
    {
        var scraper = _scrapers.FirstOrDefault(s => s.SuportaTribunal(numeroProcesso));

        if (scraper == null)
        {
            throw new NotSupportedException($"Nenhum scraper suporta a numeração informada: {numeroProcesso}");
        }

        return scraper;
    }
}