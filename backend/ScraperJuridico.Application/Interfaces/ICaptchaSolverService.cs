namespace ScraperJuridico.Application.Interfaces;

public interface ICaptchaSolverService
{
    string Resolver(byte[] imagemBytes);
}