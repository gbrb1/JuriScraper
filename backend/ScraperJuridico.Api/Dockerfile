FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["ScraperJuridico.Api/ScraperJuridico.Api.csproj", "ScraperJuridico.Api/"]
COPY ["ScraperJuridico.Application/ScraperJuridico.Application.csproj", "ScraperJuridico.Application/"]
COPY ["ScraperJuridico.Domain/ScraperJuridico.Domain.csproj", "ScraperJuridico.Domain/"]
COPY ["ScraperJuridico.Infrastructure/ScraperJuridico.Infrastructure.csproj", "ScraperJuridico.Infrastructure/"]

RUN dotnet restore "ScraperJuridico.Api/ScraperJuridico.Api.csproj"

COPY . .
WORKDIR "/src/ScraperJuridico.Api"

RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# instala as dependências de sistema necessárias para o Chromium rodar no Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2t64 \
    fonts-liberation \
    libu2f-udev \
    libvulkan1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# instala o chromium do playwright
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npx playwright install chromium \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "ScraperJuridico.Api.dll"]