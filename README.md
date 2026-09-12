# JuriScraper

## Automação de Consulta e Integração de Processos Judiciais

O **JuriScraper** é uma aplicação para consulta automatizada de processos judiciais nos portais do **TJSP** e **PJe-TRT**, realizando a extração, persistência e disponibilização dos dados por meio de uma API REST.

O sistema permite consultas individuais e em lote, armazenamento local dos processos consultados, re-extração de dados diretamente dos tribunais e interação manual para resolução de CAPTCHA quando necessário.

---

## 🚀 Como Executar com Docker

### Pré-requisito

* Docker Desktop instalado e em execução

### 1. Extrair o projeto

Extraia o arquivo `.zip` em uma pasta de sua preferência.

### 2. Abrir o terminal

Abra um terminal dentro da pasta raiz do projeto, onde está localizado o arquivo:

```text
docker-compose.yml
```

### 3. Iniciar a aplicação

Execute:

```bash
docker compose up --build
```

Na primeira execução, o Docker irá:

* baixar as imagens necessárias
* criar o container do PostgreSQL
* inicializar o banco de dados
* aplicar automaticamente as migrations
* construir a API
* construir o frontend
* instalar as dependências necessárias para o Chromium
* baixar o Chromium utilizado pelo Playwright
* iniciar todos os serviços

A primeira execução pode levar alguns minutos devido ao download das imagens e dependências.

### 🌐 Endereços de Acesso

**Aplicação Web:**

```text
http://localhost:3000
```

**API:**

```text
http://localhost:5189
```

**Swagger:**

```text
http://localhost:5189/swagger
```

### 🗄️ Banco de Dados

O PostgreSQL é executado automaticamente em um container separado.

As migrations do Entity Framework Core são aplicadas automaticamente durante a inicialização da API.

Portanto, **não é necessário executar comandos de migration manualmente**.

### 🔌 Endpoints da API

#### Listar processos

```http
GET /processos
```

#### Consultar processo

```http
GET /processos/{numeroProcesso}
```

### 🔄 Reconstruir os containers

Após alterações no código, utilize:

```bash
docker compose up --build
```

Caso nenhuma alteração exija uma nova build, basta iniciar os containers:

```bash
docker compose up
```

### 🛑 Encerrar a aplicação

Para interromper a aplicação diretamente no terminal:

```text
Ctrl + C
```

Ou execute:

```bash
docker compose down
```

---

# 📖 Guia de Uso

## 1. Consulta Individual

Acesse a aplicação:

```text
http://localhost:3000
```

No campo **Número do Processo**, informe o número CNJ completo.

Exemplo:

```text
1501983-25.2022.8.26.0022
```

Clique em **Consultar**.

O sistema irá:

* identificar automaticamente o tribunal pelo número CNJ
* verificar se o processo já está armazenado no banco
* retornar os dados armazenados quando disponíveis
* realizar uma consulta ao tribunal caso o processo ainda não esteja salvo

Para ignorar os dados armazenados e realizar uma nova consulta diretamente no tribunal, utilize o botão:

```text
Buscar novas informações no tribunal
```

---

## 2. Consulta em Lote

Na seção **Consulta em Lote**:

1. Cole os números dos processos na caixa de texto
2. Informe **um processo por linha**
3. Clique em **Iniciar Extração em Lote**

Exemplo:

```text
0000234-11.2026.5.12.0034
0020169-74.2026.5.04.0029
1501983-25.2022.8.26.0022
1501843-43.2019.8.26.0653
```

Os processos são tratados sequencialmente.

Caso algum processo apresente erro, como número inválido, processo indisponível ou acesso restrito, o erro será registrado e o sistema continuará automaticamente com os próximos processos da fila.

---

## 3. Resolução de CAPTCHA

Durante consultas aos portais PJe dos Tribunais Regionais do Trabalho, o tribunal pode solicitar uma verificação CAPTCHA.

Quando isso ocorrer:

1. Um alerta será exibido na aplicação
2. A imagem do CAPTCHA será apresentada em um modal
3. Digite os caracteres exibidos
4. Clique em **Enviar Resolução**

Caso a imagem esteja ilegível ou seja necessário interromper a consulta:

```text
⛔ Cancelar
```

A resolução é realizada mediante interação do usuário. O sistema não utiliza mecanismos automatizados para contornar o CAPTCHA.

O sistema verifica se houve mudança na imagem do CAPTCHA e, caso mude, a nova imagem será mostrada ao usuário.

---

## 4. Seleção de Instância

Em determinadas consultas no PJe, o mesmo número de processo pode estar disponível em mais de uma instância.

Quando isso ocorrer, a aplicação exibirá as instâncias encontradas, por exemplo:

```text
1º Grau — Vara do Trabalho
2º Grau — Tribunal Regional
```

Selecione o grau desejado para continuar a consulta.

---

## 5. Histórico e Gerenciamento

Abaixo das áreas de consulta, a aplicação apresenta os processos armazenados localmente.

### 🔎 Ver detalhes

Clique em um processo para visualizar informações como:

* número do processo
* tribunal
* classe
* assunto
* foro/comarca
* data de distribuição
* partes envolvidas
* data e conteúdo da última movimentação

### 🔄 Buscar novas informações no tribunal

Realiza uma nova consulta diretamente no tribunal, ignorando os dados armazenados localmente.

### 🗑️ Excluir

Remove o processo e seus dados relacionados do banco de dados local.

---

# 🏛️ Tribunais Suportados

O sistema possui suporte para:

```text
TJSP
Tribunais Regionais do Trabalho (PJe-TRT)
```

O tribunal é identificado automaticamente a partir do número CNJ informado.

---

# 🧱 Tecnologias

## Backend

```text
.NET
Entity Framework Core
PostgreSQL
Playwright
```

## Frontend

```text
React
Vite
JavaScript
```

## Infraestrutura

```text
Docker
Docker Compose
Nginx
```

---

# 🏗️ Arquitetura

O backend utiliza **Clean Architecture**, separando as responsabilidades em diferentes projetos:

```text
JuriScraper
│
├── JuriScraper.Domain
│   └── Entidades e regras de domínio
│
├── JuriScraper.Application
│   └── Casos de uso, DTOs e contratos
│
├── JuriScraper.Infrastructure
│   └── Banco de dados, repositórios e scrapers
│
└── JuriScraper.Api
    └── Controllers e exposição da API
```

Essa separação mantém as regras de negócio independentes das tecnologias utilizadas para persistência, scraping e exposição HTTP.

---

# 📋 Dados Extraídos

Quando disponíveis nos tribunais consultados, o sistema busca informações como:

* Número do processo
* Classe processual
* Assunto
* Foro/Comarca
* Data de distribuição
* Partes
* Última movimentação
* Data da última movimentação
* Histórico de movimentações
* Informações complementares disponibilizadas pelo tribunal

---

# ⚠️ Observações

A disponibilidade das informações depende dos próprios portais dos tribunais.

Processos em segredo de justiça, números inválidos, indisponibilidade temporária do tribunal ou mecanismos de segurança podem impedir a obtenção de determinados dados.
