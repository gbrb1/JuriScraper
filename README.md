# ⚖️ JuriScraper

## Automação de Consulta e Integração de Processos Judiciais

O **JuriScraper** é uma aplicação completa para consulta automatizada de processos judiciais nos portais do **TJSP** e **PJe-TRT**, realizando extração em tempo real via **Playwright**, resolução automática de CAPTCHAs via **ONNX**, persistência em banco, e disponibilização dos dados por meio de uma API REST acompanhada de uma interface moderna em React.

O sistema permite consultas individuais e em lote, pesquisa em registros locais, persistência condicional inteligente (apenas quando novos dados são detectados) e sincronização independente de instâncias (1º e 2º Grau).

> ❤️ **Agradecimento**
>
> Meu agradecimento especial aos desenvolvedores e contribuidores do **decryptr/captcha** pelo trabalho dedicado à pesquisa e implementação de reconhecimento automatizado de CAPTCHAs, e por disponibilizarem esse trabalho à comunidade.
> O projeto original disponibiliza diferentes modelos treinados para CAPTCHAs de sistemas como **TRT, TJMG, TJPE, TJRS, ESAJ e Receita Federal**, entre outros.<br />
>Confira o trabalho em:
> https://github.com/decryptr/captcha
><br />
>O modelo utilizado originalmente pelo projeto foi desenvolvido com R + Torch/Luz e disponibilizado no formato .pt. <br />Para permitir sua execução diretamente na aplicação .NET, o modelo foi convertido para ONNX, mantendo a mesma arquitetura e os mesmos pesos da versão original.
---

# 📖 Guia de Uso

## 1. Execução com Docker 🐳

### 1.1 Pré-requisito

* Docker Desktop instalado e em execução

### 1.2 Clonar o projeto

Clone o repositório:
```
git clone https://github.com/gbrb1/JuriScraper.git
```
Entre na pasta do projeto:
```
cd JuriScraper
```
### 1.3 Iniciar a aplicação pela primeira vez

Na primeira execução, utilize:
```
docker compose up --build
```
O Docker irá:

* Baixar as imagens necessárias (.NET, Node, PostgreSQL)
* Criar e inicializar o container do PostgreSQL (5432)
* Construir a API (.NET) com o runtime ONNX e o Playwright
* Instalar as dependências do SO no container e baixar o Chromium
* Construir o frontend React 
* Iniciar todos os serviços conectados em rede interna

### 1.4 Execuções seguintes

Para inicializar em segundo plano liberando o terminal:
```
docker compose up -d
```
Caso altere o código e queira reconstruir as imagens:
```
docker compose up --build -d
```
### 1.5 🌐 Endereços de Acesso

* **Interface Web (Frontend):** http://localhost:3000
* **API REST:** http://localhost:5189
* **Swagger UI:** http://localhost:5189/swagger

---

## 2. Consulta Individual

1. Acesse http://localhost:3000.
2. No campo de busca superior, insira o número CNJ completo (ex: 0010263-82.2026.5.15.0052).
3. Clique em **Consultar**.

> **Comportamento da Busca Superior:** A busca principal **sempre consulta o tribunal ao vivo diretamente**, sem bloquear ou reaproveitar dados desatualizados do banco local.

### 💾 Salvamento Condicional Inteligente
Após o scrape, os dados extraídos são confrontados com os registros salvos:
* **Se o processo não existir no banco** ou **se houver novas movimentações/alterações cadastrais**: O botão "💾 Salvar" fica disponível para inclusão/atualização.
* **Se os dados extraídos forem idênticos aos do banco**: A interface exibe a tag "✓ Sincronizado" e dispensa gravação redundante.

---

## 3. Consulta em Lote

Na aba **Consulta em Lote**:

1. Cole a lista de processos no campo de texto (um número CNJ por linha).
2. Clique em **Iniciar Extração em Lote**.

O processamento é executado sequencialmente. Erros pontuais em um processo (ex: número inexistente ou tribunal fora do ar) são registrados de forma isolada na lista de status, permitindo que a fila continue rodando até o fim sem interrupções.

---

## 4. Múltiplas Instâncias e Graus de Jurisdição

O PJe permite que o mesmo número CNJ tramite no 1º Grau (Vara) e 2º Grau (Tribunal). O **JuriScraper** trata a chave primária composta por (NumeroProcesso, Tribunal, Grau):

* Quando o PJe identifica mais de uma instância, a aplicação exibe um painel para que o usuário escolha qual grau deseja extrair.


---

## 5. Resolução Automática de CAPTCHA via IA (ONNX)

Durante a consulta a portais PJe-TRT com desafio visual:

* O sistema extrai a imagem do CAPTCHA em memória e alimenta um modelo **ONNX** acoplado ao runtime do C#.
* A inferência do texto é feita localmente, preenchendo e submetendo o formulário automaticamente.
* Na interface, o usuário visualiza o status animado **"⚠️ Resolvendo CAPTCHA..."** até a liberação da tela de andamentos.
* O botão **⛔ Cancelar** permite abortar a requisição e interromper a instância do navegador a qualquer momento.

---

## 6. Processos Salvos e Filtro Local

Abaixo da área de consulta fica a tabela com o histórico de processos persistidos:

* **Search Box Local:** Permite filtrar instantaneamente a listagem salva por número CNJ, tribunal, vara/foro ou classe judicial sem precisar bater na rede.
* **Ver Detalhes:** Carrega os dados salvos localmente na visualização superior.
* **🔄 Re-extrair:** Realiza scrape no portal do tribunal para atualizar o registro salvo.
* **🗑️ Excluir:** Remove o processo e suas partes relacionadas do banco de dados PostgreSQL.

### 🛑 Encerrar a aplicação

Para parar e remover os containers:
```
docker compose down
```
---

# 🔌 API e Principais Endpoints

- ### Listar todos os processos
```http
GET /api/Processos/ListarTodos
```
Retorna todos os processos salvos no banco de dados.

- ### Consultar processo
```http
GET /api/Processos/ConsultarPorNumero
```
Executa o scraper em tempo real no portal do tribunal competente e retorna os dados coletados.

- ### Salvar processo
```http
POST /api/Processos/SalvarProcesso
```
Salva processo em banco.

- ### Excluir processo
```http
DELETE /api/Processos/Excluir
```
Remove o processo do banco.


---

# 🏛️ Tribunais Suportados

* **TJSP (e-SAJ):** 1º Grau e Colégio Recursal
* **TRT-2 (SP / Região Metropolitana):** PJe 1º e 2º Grau
* **TRT-4 (RS):** PJe 1º e 2º Grau
* **TRT-12 (SC):** PJe 1º e 2º Grau
* **TRT-15 (Campinas e Interior de SP):** PJe 1º e 2º Grau

---

- # Backend

🟣 **.NET**

🎭 **Playwright**

- # Frontend

⚛️ **React**

⚡ **Vite**

- # Infraestrutura

🐳 **Docker**

🔷 **Entity Framework Core**

🐘 **PostgreSQL**

---

# 🏗️ Arquitetura

O backend segue os princípios de **Clean Architecture**, isolando as dependências de IO externo e bibliotecas nativas das regras de domínio:

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

---

# 📋 Dados Extraídos

* Número CNJ do processo
* Tribunal e Grau de Jurisdição (1º ou 2º Grau)
* Classe Processual
* Assunto Principal
* Foro / Comarca / Órgão Julgador
* Polos e Partes Envolvidas (Autor, Réu, Advogados)
* Data e descrição do último andamento processual
