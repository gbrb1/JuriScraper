using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using ScraperJuridico.Application.Interfaces;
using SkiaSharp;

namespace ScraperJuridico.Infrastructure.Services;

public class OnnxCaptchaSolverService : ICaptchaSolverService, IDisposable
{
    private readonly InferenceSession _session;
    private readonly string _inputName;

    private const int Largura = 192;
    private const int Altura = 32;
    private const int Canais = 3;

    private static readonly string[] Vocabulary =
    {
        "2", "3", "4", "5", "6", "7", "8", "9",
        "a", "b", "d", "e", "f", "h", "j", "k",
        "m", "n", "r", "s", "t", "u", "v", "w", "x", "y"
    };

    public OnnxCaptchaSolverService(string modelPath)
    {
        if (!File.Exists(modelPath))
        {
            throw new FileNotFoundException($"Modelo ONNX não encontrado em: {modelPath}");
        }

        var sessionOptions = new SessionOptions
        {
            GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL
        };

        _session = new InferenceSession(modelPath, sessionOptions);
        _inputName = _session.InputMetadata.Keys.First();
    }

    public string Resolver(string base64Imagem)
    {
        int indiceBase64 = base64Imagem.IndexOf("base64,", StringComparison.OrdinalIgnoreCase);
        if (indiceBase64 >= 0)
        {
            base64Imagem = base64Imagem[(indiceBase64 + 7)..];
        }

        byte[] bytes = Convert.FromBase64String(base64Imagem);
        return Resolver(bytes);
    }

    public string Resolver(byte[] imagemBytes)
    {
        using var originalBitmap = SKBitmap.Decode(imagemBytes);

        // 1. Redimensiona para 192x32 com interpolação de alta qualidade
        var resizeInfo = new SKImageInfo(Largura, Altura, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var resizedBitmap = originalBitmap.Resize(resizeInfo, new SKSamplingOptions(SKCubicResampler.Mitchell));

        if (resizedBitmap == null)
        {
            throw new InvalidOperationException("Falha ao redimensionar a imagem do CAPTCHA.");
        }

        // 2. Prepara o Tensor [1, 3, 32, 192] no formato CHW (R, G, B separados)
        var tensor = new DenseTensor<float>(new[] { 1, Canais, Altura, Largura });

        for (int y = 0; y < Altura; y++)
        {
            for (int x = 0; x < Largura; x++)
            {
                var pixel = resizedBitmap.GetPixel(x, y);

                // Normalização: pixel / 255.0
                tensor[0, 0, y, x] = pixel.Red / 255.0f;   // Canal R
                tensor[0, 1, y, x] = pixel.Green / 255.0f; // Canal G
                tensor[0, 2, y, x] = pixel.Blue / 255.0f;  // Canal B
            }
        }

        // 3. Inferência no ONNX Runtime
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor(_inputName, tensor)
        };

        using var results = _session.Run(inputs);
        var outputTensor = results.First().AsTensor<float>();

        // 4. ArgMax para decodificar os 6 caracteres
        var resultado = new char[6];

        for (int pos = 0; pos < 6; pos++)
        {
            int melhorIndice = 0;
            float maiorLogit = float.MinValue;

            for (int classe = 0; classe < 26; classe++)
            {
                float valor = outputTensor[0, pos, classe];
                if (valor > maiorLogit)
                {
                    maiorLogit = valor;
                    melhorIndice = classe;
                }
            }

            resultado[pos] = Vocabulary[melhorIndice][0];
        }

        return new string(resultado);
    }

    public void Dispose()
    {
        _session?.Dispose();
        GC.SuppressFinalize(this);
    }
}