import { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:5189";

const PROCESSOS_TESTE = [
  { tribunal: "TRT-15", numero: "0010263-82.2026.5.15.0052" },
  { tribunal: "TRT-2", numero: "1000320-88.2026.5.02.0083" },
  { tribunal: "TRT-12", numero: "0000234-11.2026.5.12.0034" },
  { tribunal: "TRT-4", numero: "0020169-74.2026.5.04.0029" },
  { tribunal: "TJ-SP", numero: "1501983-25.2022.8.26.0022" },
  { tribunal: "TJ-SP", numero: "1501843-43.2019.8.26.0653" },
  { tribunal: "TJ-SP", numero: "1033404-26.2024.8.26.0053" },
  { tribunal: "TJ-SP", numero: "0603745-96.2008.8.26.0053" },
  { tribunal: "TJ-SP", numero: "0008626-06.2011.8.26.0072" },
];

export default function App() {
  const [modoAba, setModoAba] = useState("individual");
  const [numeroInput, setNumeroInput] = useState("");
  const [loteTexto, setLoteTexto] = useState("");

  const [filaLote, setFilaLote] = useState([]);
  const [executandoLote, setExecutandoLote] = useState(false);

  const [processoAtualEmExecucao, setProcessoAtualEmExecucao] = useState("");
  const [carregandoIndividual, setCarregandoIndividual] = useState(false);
  const [resultadoAtual, setResultadoAtual] = useState(null);
  const [erro, setErro] = useState(null);

  const [opcoesGrau, setOpcoesGrau] = useState([]);
  const [selecionandoGrau, setSelecionandoGrau] = useState(false);

  // CAPTCHA
  const [captchaImg, setCaptchaImg] = useState(null);
  const [captchaVersao, setCaptchaVersao] = useState(0);
  const [avisoErroCaptcha, setAvisoErroCaptcha] = useState(false);
  const [mensagemErroCaptcha, setMensagemErroCaptcha] = useState("");
  const [respostaCaptcha, setRespostaCaptcha] = useState("");
  const [enviandoCaptcha, setEnviandoCaptcha] = useState(false);

  const [processosSalvos, setProcessosSalvos] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(false);

  // Animação de Pontinhos (333ms)
  const [pontosLoading, setPontosLoading] = useState("");

  const inputCaptchaRef = useRef(null);
  const abortControllerRef = useRef(null);
  const canceladoManualmenteRef = useRef(false);

  const emProcessamento = carregandoIndividual || executandoLote;
  // Bloqueio das abas: ativo durante scraping, espera de captcha ou escolha de grau
  const abasBloqueadas =
    emProcessamento || !!captchaImg || opcoesGrau.length > 0;
  const sessionIdAtual = processoAtualEmExecucao.replace(/\D/g, "");

  useEffect(() => {
    carregarProcessosDoBanco();
  }, []);

  // Efeito dos 3 pontinhos ciclando a cada 333ms
  useEffect(() => {
    if (!emProcessamento) {
      setPontosLoading("");
      return;
    }

    const intervalId = setInterval(() => {
      setPontosLoading((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 333);

    return () => clearInterval(intervalId);
  }, [emProcessamento]);

  const carregarProcessosDoBanco = async () => {
    setCarregandoLista(true);
    try {
      const res = await fetch(`${API_BASE}/api/Processos`);
      if (res.ok) {
        const data = await res.json();
        setProcessosSalvos(Array.isArray(data) ? data : []);
      }
    } catch {
      // Backend pode estar iniciando
    } finally {
      setCarregandoLista(false);
    }
  };

  const handleExcluirProcesso = async (numeroProcesso, tribunal) => {
    const confirmou = window.confirm(
      `Deseja realmente excluir o processo ${numeroProcesso} (${tribunal}) do banco de dados?`
    );
    if (!confirmou) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/Processos/${encodeURIComponent(
          tribunal
        )}/${encodeURIComponent(numeroProcesso)}`,
        {
          method: "DELETE",
        }
      );

      if (res.ok) {
        if (
          resultadoAtual?.numeroProcesso === numeroProcesso &&
          resultadoAtual?.tribunal === tribunal
        ) {
          setResultadoAtual(null);
        }
        await carregarProcessosDoBanco();
      } else {
        const erroJson = await res.json().catch(() => null);
        alert(
          `Falha ao excluir processo: ${erroJson?.mensagem || res.statusText}`
        );
      }
    } catch {
      alert("Erro ao conectar ao servidor para excluir o registro.");
    }
  };

  const handleAtualizarProcesso = async (numeroProcesso, tribunal) => {
    const confirmou = window.confirm(
      `Deseja buscar novas informações do processo ${numeroProcesso}? Ele será re-extraído do tribunal para atualizar os dados.`
    );
    if (!confirmou) return;

    try {
      // 1. Apaga do banco para garantir que o backend não devolva em cache
      await fetch(
        `${API_BASE}/api/Processos/${encodeURIComponent(
          tribunal
        )}/${encodeURIComponent(numeroProcesso)}`,
        {
          method: "DELETE",
        }
      );
      await carregarProcessosDoBanco();
    } catch {
      // Continua para extrair mesmo se houver falha prévia de delete
    }

    // 2. Prepara a UI da aba individual para iniciar a raspagem ao vivo
    setModoAba("individual");
    setNumeroInput(numeroProcesso);
    setResultadoAtual(null);
    setErro(null);
    setCarregandoIndividual(true);
    canceladoManualmenteRef.current = false;
    abortControllerRef.current = new AbortController();

    window.scrollTo({ top: 0, behavior: "smooth" });

    // 3. Executa a raspagem
    const resultado = await executarExtracaoProcesso(
      numeroProcesso,
      abortControllerRef.current.signal
    );

    if (resultado.sucesso) {
      setResultadoAtual(resultado.dados);

      // Salva automaticamente o processo recém-extraído no banco
      try {
        const resSalvar = await fetch(`${API_BASE}/api/Processos/salvar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resultado.dados),
        });

        if (resSalvar.ok) {
          await carregarProcessosDoBanco();
        }
      } catch {
        // Silencia erro caso haja falha temporária de conexão
      }
    } else if (!canceladoManualmenteRef.current) {
      setErro(resultado.erro);
    }

    setCarregandoIndividual(false);
    abortControllerRef.current = null;
  };

  // Polling unificado para Grau e CAPTCHA
  useEffect(() => {
    let intervalId = null;

    if (emProcessamento && sessionIdAtual) {
      intervalId = setInterval(async () => {
        try {
          if (opcoesGrau.length === 0 && !captchaImg) {
            const resGrau = await fetch(
              `${API_BASE}/api/Captcha/opcoes-grau/${sessionIdAtual}`
            );
            if (resGrau.ok) {
              const dataGrau = await resGrau.json();
              if (dataGrau.opcoes && dataGrau.opcoes.length > 0) {
                setOpcoesGrau(dataGrau.opcoes);
              }
            }
          }

          const resCaptcha = await fetch(
            `${API_BASE}/api/Captcha/${sessionIdAtual}`
          );
          if (resCaptcha.ok) {
            const dataCaptcha = await resCaptcha.json();

            if (dataCaptcha.versao && dataCaptcha.versao !== captchaVersao) {
              setCaptchaImg(dataCaptcha.imagem);
              setCaptchaVersao(dataCaptcha.versao);
              setAvisoErroCaptcha(dataCaptcha.houveErro || false);
              setMensagemErroCaptcha(
                dataCaptcha.mensagemErro ||
                  "Os caracteres informados estão inválidos. Tente novamente."
              );
              setRespostaCaptcha("");
              setEnviandoCaptcha(false);
              setTimeout(() => inputCaptchaRef.current?.focus(), 100);
            }
          }
        } catch {
          // Silencia falhas temporárias
        }
      }, 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    emProcessamento,
    sessionIdAtual,
    opcoesGrau.length,
    captchaImg,
    captchaVersao,
  ]);

  const handleCancelarExecucao = async () => {
    canceladoManualmenteRef.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (processoAtualEmExecucao) {
      try {
        await fetch(
          `${API_BASE}/api/Captcha/limpar-sessao/${encodeURIComponent(
            processoAtualEmExecucao
          )}`,
          {
            method: "POST",
          }
        );
      } catch {
        // Ignora falhas de rede ao tentar limpar
      }
    }

    setCarregandoIndividual(false);
    setExecutandoLote(false);
    setProcessoAtualEmExecucao("");
    setOpcoesGrau([]);
    setCaptchaImg(null);
    setCaptchaVersao(0);
    setAvisoErroCaptcha(false);
    setMensagemErroCaptcha("");
    setRespostaCaptcha("");
    setEnviandoCaptcha(false);

    setFilaLote((prev) =>
      prev.map((item) =>
        item.status === "pendente" || item.status === "executando"
          ? {
              ...item,
              status: "erro",
              erro: "Operação cancelada pelo usuário.",
            }
          : item
      )
    );

    setErro("Operação cancelada pelo usuário.");
  };

  const executarExtracaoProcesso = async (numero, signal) => {
    const numLimpo = numero.trim();
    setProcessoAtualEmExecucao(numLimpo);
    setOpcoesGrau([]);
    setCaptchaImg(null);
    setCaptchaVersao(0);
    setAvisoErroCaptcha(false);
    setMensagemErroCaptcha("");
    setRespostaCaptcha("");

    try {
      const res = await fetch(
        `${API_BASE}/api/Processos/${encodeURIComponent(numLimpo)}`,
        { signal }
      );

      const textoResposta = await res.text();
      let data = null;

      try {
        data = JSON.parse(textoResposta);
      } catch {
        data = null;
      }

      if (!res.ok) {
        const mensagemErro =
          data?.mensagem ||
          data?.detalhe ||
          (typeof textoResposta === "string" && textoResposta.trim().length > 0
            ? textoResposta
            : `Erro ${res.status}: Falha ao processar solicitação.`);
        throw new Error(mensagemErro);
      }

      return { sucesso: true, dados: data };
    } catch (err) {
      if (err.name === "AbortError" || canceladoManualmenteRef.current) {
        return { sucesso: false, erro: "Operação cancelada pelo usuário." };
      }
      return { sucesso: false, erro: err.message };
    } finally {
      setOpcoesGrau([]);
      setCaptchaImg(null);
      setCaptchaVersao(0);
      setProcessoAtualEmExecucao("");
    }
  };

  const handleConsultaIndividual = async (e) => {
    if (e) e.preventDefault();
    const numeroLimpo = numeroInput.trim();
    if (!numeroLimpo) return;

    // Verifica se já está salvo no banco local
    const processoJaSalvo = processosSalvos.find(
      (p) =>
        p.numeroProcesso.replace(/\D/g, "") === numeroLimpo.replace(/\D/g, "")
    );

    if (processoJaSalvo) {
      alert(
        `O processo ${processoJaSalvo.numeroProcesso} (${processoJaSalvo.tribunal}) ` +
          `já está salvo no sistema. Caso queira buscar dados novos diretamente no tribunal, ` +
          `utilize o botão de atualizar (🔄) na listagem abaixo.`
      );
      setResultadoAtual(processoJaSalvo);
      return;
    }

    canceladoManualmenteRef.current = false;
    abortControllerRef.current = new AbortController();

    setCarregandoIndividual(true);
    setResultadoAtual(null);
    setErro(null);

    const resultado = await executarExtracaoProcesso(
      numeroLimpo,
      abortControllerRef.current.signal
    );

    if (resultado.sucesso) {
      setResultadoAtual(resultado.dados);
    } else if (!canceladoManualmenteRef.current) {
      setErro(resultado.erro);
    }

    setCarregandoIndividual(false);
    abortControllerRef.current = null;
  };

  const handleIniciarLote = async (e) => {
    if (e) e.preventDefault();

    const linhas = loteTexto
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (linhas.length === 0) return;

    canceladoManualmenteRef.current = false;

    const itensIniciais = linhas.map((num) => ({
      numero: num,
      status: "pendente",
      erro: null,
      dados: null,
    }));

    setFilaLote(itensIniciais);
    setExecutandoLote(true);
    setErro(null);

    for (let i = 0; i < itensIniciais.length; i++) {
      if (canceladoManualmenteRef.current) break;

      abortControllerRef.current = new AbortController();

      setFilaLote((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: "executando" } : item
        )
      );

      const resultado = await executarExtracaoProcesso(
        itensIniciais[i].numero,
        abortControllerRef.current.signal
      );

      if (canceladoManualmenteRef.current) break;

      setFilaLote((prev) =>
        prev.map((item, idx) => {
          if (idx === i) {
            return resultado.sucesso
              ? { ...item, status: "sucesso", dados: resultado.dados }
              : { ...item, status: "erro", erro: resultado.erro };
          }
          return item;
        })
      );
    }

    setExecutandoLote(false);
    abortControllerRef.current = null;
  };

  const preencherComProcessosDoTeste = () => {
    const texto = PROCESSOS_TESTE.map((p) => p.numero).join("\n");
    setLoteTexto(texto);
  };

  const handleSelecionarGrau = async (indice) => {
    setSelecionandoGrau(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/Captcha/selecionar-grau/${sessionIdAtual}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ indice }),
        }
      );

      if (res.ok) {
        setOpcoesGrau([]);
      } else {
        alert("Falha ao selecionar instância.");
      }
    } catch {
      alert("Erro ao comunicar com a API.");
    } finally {
      setSelecionandoGrau(false);
    }
  };

  const handleEnviarCaptcha = async (e) => {
    e.preventDefault();
    if (!respostaCaptcha.trim() || enviandoCaptcha) return;

    setEnviandoCaptcha(true);
    try {
      const res = await fetch(`${API_BASE}/api/Captcha/${sessionIdAtual}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: respostaCaptcha.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setEnviandoCaptcha(false);
        throw new Error(data.mensagem || "Erro ao enviar resposta do CAPTCHA.");
      }
    } catch (err) {
      setEnviandoCaptcha(false);
      alert(`Erro: ${err.message}`);
    }
  };

  const totalLote = filaLote.length;
  const concluidosLote = filaLote.filter(
    (item) => item.status === "sucesso" || item.status === "erro"
  ).length;
  const porcentagemLote =
    totalLote > 0 ? Math.round((concluidosLote / totalLote) * 100) : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        margin: 0,
        padding: "32px 16px 60px",
        background:
          "linear-gradient(145deg, #0b0f19 0%, #111827 50%, #030712 100%)",
        backgroundAttachment: "fixed",
        color: "#e2e8f0",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ maxWidth: 1080, width: "100%", textAlign: "center" }}>
        <header
          style={{
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            paddingBottom: 20,
            marginBottom: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              background: "linear-gradient(90deg, #60a5fa, #c084fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            JuriScraper Core
          </h1>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              marginTop: 14,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}
            >
              Powered by
            </span>

            {/* .NET */}
            <a
              href="https://dotnet.microsoft.com/"
              target="_blank"
              rel="noreferrer"
              title=".NET"
              style={{
                display: "flex",
                alignItems: "center",
                transition: "transform 0.2s, opacity 0.2s",
                opacity: 0.85,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.15)";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.opacity = "0.85";
              }}
            >
              <img
                src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/DotNet.svg"
                alt=".NET"
                style={{ width: 26, height: 26 }}
              />
            </a>

            {/* Playwright */}
            <a
              href="https://playwright.dev/"
              target="_blank"
              rel="noreferrer"
              title="Playwright"
              style={{
                display: "flex",
                alignItems: "center",
                transition: "transform 0.2s, opacity 0.2s",
                opacity: 0.85,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.15)";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.opacity = "0.85";
              }}
            >
              <img
                src="https://playwright.dev/img/playwright-logo.svg"
                alt="Playwright"
                style={{ width: 26, height: 26 }}
              />
            </a>

            {/* React */}
            <a
              href="https://react.dev/"
              target="_blank"
              rel="noreferrer"
              title="React"
              style={{
                display: "flex",
                alignItems: "center",
                transition: "transform 0.2s, opacity 0.2s",
                opacity: 0.85,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.15)";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.opacity = "0.85";
              }}
            >
              <img
                src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/React-Dark.svg"
                alt="React"
                style={{ width: 26, height: 26 }}
              />
            </a>

            {/* PostgreSQL */}
            <a
              href="https://www.postgresql.org/"
              target="_blank"
              rel="noreferrer"
              title="PostgreSQL"
              style={{
                display: "flex",
                alignItems: "center",
                transition: "transform 0.2s, opacity 0.2s",
                opacity: 0.85,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.15)";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.opacity = "0.85";
              }}
            >
              <img
                src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/PostgreSQL-Dark.svg"
                alt="PostgreSQL"
                style={{ width: 26, height: 26 }}
              />
            </a>
          </div>
        </header>
        <div
          style={{
            textAlign: "center",
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            Tribunais Suportados
          </span>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <a
              href="https://esaj.tjsp.jus.br/cpopg/open.do"
              target="_blank"
              rel="noreferrer"
              title="Tribunal de Justiça do Estado de São Paulo"
              style={{
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                color: "#d8b4fe",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.7)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.15)";
              }}
            >
              TJSP (e-SAJ)
            </a>

            <a
              href="https://pje.trt2.jus.br/consultaprocessual/"
              target="_blank"
              rel="noreferrer"
              title="Tribunal Regional do Trabalho da 2ª Região (São Paulo e Região Metropolitana)"
              style={{
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                color: "#d8b4fe",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.7)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.15)";
              }}
            >
              TRT-2 (SP)
            </a>

            <a
              href="https://pje.trt4.jus.br/consultaprocessual/"
              target="_blank"
              rel="noreferrer"
              title="Tribunal Regional do Trabalho da 4ª Região (Rio Grande do Sul)"
              style={{
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                color: "#d8b4fe",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.7)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.15)";
              }}
            >
              TRT-4 (RS)
            </a>

            <a
              href="https://pje.trt12.jus.br/consultaprocessual/"
              target="_blank"
              rel="noreferrer"
              title="Tribunal Regional do Trabalho da 12ª Região (Santa Catarina)"
              style={{
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                color: "#d8b4fe",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.7)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.15)";
              }}
            >
              TRT-12 (SC)
            </a>

            <a
              href="https://pje.trt15.jus.br/consultaprocessual/"
              target="_blank"
              rel="noreferrer"
              title="Tribunal Regional do Trabalho da 15ª Região (Campinas e Interior de SP)"
              style={{
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                color: "#d8b4fe",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.7)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.15)";
              }}
            >
              TRT-15 (Campinas)
            </a>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <button
            onClick={() => setModoAba("individual")}
            disabled={abasBloqueadas}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: "bold",
              borderRadius: 8,
              border: "none",
              cursor: abasBloqueadas ? "not-allowed" : "pointer",
              background:
                modoAba === "individual" ? "#2563eb" : "rgba(30, 41, 59, 0.6)",
              color: modoAba === "individual" ? "#fff" : "#94a3b8",
              boxShadow:
                modoAba === "individual"
                  ? "0 4px 14px rgba(37, 99, 235, 0.4)"
                  : "none",
            }}
          >
            🔍 Consulta Individual
          </button>
          <button
            onClick={() => setModoAba("lote")}
            disabled={abasBloqueadas}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: "bold",
              borderRadius: 8,
              border: "none",
              cursor: abasBloqueadas ? "not-allowed" : "pointer",
              background:
                modoAba === "lote" ? "#2563eb" : "rgba(30, 41, 59, 0.6)",
              color: modoAba === "lote" ? "#fff" : "#94a3b8",
              boxShadow:
                modoAba === "lote"
                  ? "0 4px 14px rgba(37, 99, 235, 0.4)"
                  : "none",
            }}
          >
            📦 Consulta em Lote
          </button>
        </div>

        {modoAba === "individual" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 340px",
              gap: 20,
              marginBottom: 24,
              textAlign: "left",
            }}
          >
            <div
              style={{
                background: "rgba(17, 24, 39, 0.8)",
                backdropFilter: "blur(12px)",
                padding: 24,
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.08)",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
              }}
            >
              <h3 style={{ marginTop: 0, fontSize: 16, color: "#f8fafc" }}>
                Consultar Processo Único
              </h3>

              <form
                onSubmit={handleConsultaIndividual}
                style={{ display: "flex", gap: 10, marginBottom: 12 }}
              >
                <input
                  type="text"
                  placeholder="Ex: 0010263-82.2026.5.15.0052"
                  value={numeroInput}
                  onChange={(e) => setNumeroInput(e.target.value)}
                  disabled={carregandoIndividual}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    fontSize: 14,
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    color: "#f8fafc",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={carregandoIndividual || !numeroInput.trim()}
                  style={{
                    padding: "12px 22px",
                    background: carregandoIndividual ? "#475569" : "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: "600",
                    cursor: carregandoIndividual ? "not-allowed" : "pointer",
                    boxShadow: carregandoIndividual
                      ? "none"
                      : "0 4px 14px rgba(37, 99, 235, 0.4)",
                  }}
                >
                  {carregandoIndividual ? "Extraindo..." : "Consultar"}
                </button>

                {carregandoIndividual && (
                  <button
                    type="button"
                    onClick={handleCancelarExecucao}
                    style={{
                      padding: "12px 18px",
                      background: "#dc2626",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    ⛔ Cancelar
                  </button>
                )}
              </form>

              {carregandoIndividual && (
                <div
                  style={{
                    padding: 14,
                    background: "rgba(37, 99, 235, 0.15)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    borderRadius: 8,
                    color: "#60a5fa",
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  ⏳ <strong>Extraindo dados</strong>
                  <span
                    style={{
                      display: "inline-block",
                      width: 24,
                      textAlign: "left",
                    }}
                  >
                    {pontosLoading}
                  </span>
                </div>
              )}

              {erro && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 14,
                    background: "rgba(220, 38, 38, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: 8,
                    color: "#f87171",
                    fontSize: 14,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  ❌ <strong>Erro:</strong> {erro}
                </div>
              )}
            </div>

            <div
              style={{
                background: "rgba(17, 24, 39, 0.8)",
                backdropFilter: "blur(12px)",
                padding: 24,
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  fontSize: 15,
                  color: "#cbd5e1",
                  textAlign: "center",
                }}
              >
                Tá na mão
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  maxHeight: 230,
                  overflowY: "auto",
                }}
              >
                {PROCESSOS_TESTE.map((p) => (
                  <button
                    key={p.numero}
                    onClick={() => {
                      setNumeroInput(p.numero);
                      setProcessoAtualEmExecucao(p.numero);
                      setCarregandoIndividual(true);
                      setResultadoAtual(null);
                      setErro(null);
                      canceladoManualmenteRef.current = false;
                      abortControllerRef.current = new AbortController();
                      executarExtracaoProcesso(
                        p.numero,
                        abortControllerRef.current.signal
                      ).then((res) => {
                        if (res.sucesso) {
                          setResultadoAtual(res.dados);
                        } else if (!canceladoManualmenteRef.current) {
                          setErro(res.erro);
                        }
                        setCarregandoIndividual(false);
                        abortControllerRef.current = null;
                      });
                    }}
                    disabled={emProcessamento}
                    style={{
                      textAlign: "left",
                      background: "#1e293b",
                      border: "1px solid #334155",
                      padding: "8px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: emProcessamento ? "not-allowed" : "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      color: "#e2e8f0",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#60a5fa" }}>
                      {p.tribunal}
                    </span>
                    <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>
                      {p.numero}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {modoAba === "lote" && (
          <div
            style={{
              background: "rgba(17, 24, 39, 0.8)",
              backdropFilter: "blur(12px)",
              padding: 24,
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              marginBottom: 24,
              textAlign: "left",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, color: "#f8fafc" }}>
                Processamento de Processos em Lote
              </h3>
              <button
                onClick={preencherComProcessosDoTeste}
                disabled={executandoLote}
                style={{
                  padding: "6px 14px",
                  background: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#cbd5e1",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                📋 Tá na mão
              </button>
            </div>

            <form onSubmit={handleIniciarLote}>
              <textarea
                rows={5}
                placeholder="Cole os números de processo aqui (um por linha)..."
                value={loteTexto}
                onChange={(e) => setLoteTexto(e.target.value)}
                disabled={executandoLote}
                style={{
                  width: "100%",
                  padding: 12,
                  fontSize: 13,
                  fontFamily: "monospace",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  color: "#f8fafc",
                  boxSizing: "border-box",
                  marginBottom: 12,
                }}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    type="submit"
                    disabled={executandoLote || !loteTexto.trim()}
                    style={{
                      padding: "10px 24px",
                      background: executandoLote ? "#475569" : "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontWeight: "bold",
                      fontSize: 14,
                      cursor: executandoLote ? "not-allowed" : "pointer",
                      boxShadow: executandoLote
                        ? "none"
                        : "0 4px 14px rgba(37, 99, 235, 0.4)",
                    }}
                  >
                    {executandoLote
                      ? "Processando Fila..."
                      : "Iniciar Extração em Lote"}
                  </button>

                  {executandoLote && (
                    <button
                      type="button"
                      onClick={handleCancelarExecucao}
                      style={{
                        padding: "10px 18px",
                        background: "#dc2626",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        fontWeight: "bold",
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      ⛔ Cancelar Lote
                    </button>
                  )}
                </div>

                {executandoLote && (
                  <span
                    style={{
                      fontSize: 14,
                      color: "#60a5fa",
                      fontWeight: "600",
                    }}
                  >
                    Progresso: {concluidosLote} de {totalLote} (
                    {porcentagemLote}%)
                  </span>
                )}
              </div>
            </form>

            {totalLote > 0 && (
              <div
                style={{
                  marginTop: 16,
                  background: "#1e293b",
                  borderRadius: 6,
                  height: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${porcentagemLote}%`,
                    background: "#22c55e",
                    height: "100%",
                    transition: "width 0.3s",
                  }}
                ></div>
              </div>
            )}

            {filaLote.length > 0 && (
              <div
                style={{
                  marginTop: 18,
                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  paddingTop: 14,
                }}
              >
                <h4
                  style={{
                    margin: "0 0 10px 0",
                    fontSize: 14,
                    color: "#94a3b8",
                  }}
                >
                  Status da Fila de Execução
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {filaLote.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: 6,
                        background:
                          item.status === "executando"
                            ? "rgba(37, 99, 235, 0.15)"
                            : "#1e293b",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{ fontFamily: "monospace", fontWeight: 600 }}
                      >
                        {item.numero}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {item.status === "pendente" && (
                          <span style={{ color: "#94a3b8" }}>⏳ Na fila</span>
                        )}
                        {item.status === "executando" && (
                          <span
                            style={{ color: "#60a5fa", fontWeight: "bold" }}
                          >
                            🔄 Extraindo
                            <span
                              style={{
                                display: "inline-block",
                                width: 18,
                                textAlign: "left",
                              }}
                            >
                              {pontosLoading}
                            </span>
                          </span>
                        )}
                        {item.status === "sucesso" && (
                          <>
                            <span
                              style={{ color: "#4ade80", fontWeight: "bold" }}
                            >
                              ✅ Coletado
                            </span>
                            <button
                              onClick={() => {
                                setResultadoAtual(item.dados);
                                setModoAba("individual");
                                window.scrollTo({
                                  top: 120,
                                  behavior: "smooth",
                                });
                              }}
                              style={{
                                padding: "2px 8px",
                                fontSize: 11,
                                background: "#334155",
                                border: "1px solid #475569",
                                color: "#f8fafc",
                                borderRadius: 4,
                                cursor: "pointer",
                              }}
                            >
                              Ver Dados
                            </button>
                          </>
                        )}
                        {item.status === "erro" && (
                          <span
                            style={{ color: "#f87171", fontWeight: "bold" }}
                          >
                            ❌ {item.erro}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAIS INDIVIDUAIS: Renderizam apenas quando na aba 'individual' */}
        {opcoesGrau.length > 0 && (
          <div
            style={{
              background: "rgba(30, 58, 138, 0.35)",
              border: "1px solid #3b82f6",
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                marginBottom: 12,
                position: "relative",
                justifyContent: "center",
              }}
            >
              <div style={{ textAlign: "center", flex: 1, padding: "0 90px" }}>
                <h3
                  style={{
                    margin: "0 0 4px 0",
                    color: "#93c5fd",
                    fontSize: 18,
                  }}
                >
                  Múltiplos Processos Encontrados ({opcoesGrau.length})
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "#bfdbfe" }}>
                  O tribunal localizou este processo em mais de uma instância.
                </p>
              </div>

              {/* <button
                type="button"
                onClick={handleCancelarExecucao}
                style={{
                  padding: "6px 14px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ⛔ Cancelar
              </button> */}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {opcoesGrau.map((opcao) => (
                <button
                  key={opcao.indice}
                  onClick={() => handleSelecionarGrau(opcao.indice)}
                  disabled={selecionandoGrau}
                  style={{
                    padding: "12px 20px",
                    background: "#1e40af",
                    border: "1px solid #60a5fa",
                    color: "#ffffff",
                    borderRadius: 6,
                    fontWeight: "bold",
                    fontSize: 14,
                    cursor: selecionandoGrau ? "not-allowed" : "pointer",
                  }}
                >
                  {opcao.texto}
                </button>
              ))}
            </div>
          </div>
        )}

        {captchaImg && (
          <div
            style={{
              background: "rgba(120, 53, 15, 0.3)",
              border: "1px solid #f59e0b",
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <style>
                {`
                  @keyframes piscarCaptcha {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                  }
                `}
              </style>

              <h3
                style={{
                  margin: 0,
                  color: "#fbbf24",
                  fontSize: 20,
                  textAlign: "center",
                  paddingBottom: 15,
                  flex: 1,
                  animation: "piscarCaptcha 1s infinite",
                }}
              >
                ⚠️ CAPTCHA DETECTADO
              </h3>
              {/* <button
                type="button"
                onClick={handleCancelarExecucao}
                style={{
                  padding: "6px 14px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ⛔ Cancelar
              </button> */}
            </div>

            {avisoErroCaptcha && (
              <div
                style={{
                  color: "#f87171",
                  marginBottom: 14,
                  fontWeight: "600",
                }}
              >
                ⚠️ {mensagemErroCaptcha}
              </div>
            )}

            {/* <p style={{ margin: "0 0 16px 0", fontSize: 14, color: "#fde68a" }}>
              <strong>Digite os caracteres exibidos:</strong>.
            </p> */}

            <form
              onSubmit={handleEnviarCaptcha}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{ background: "#fff", padding: 8, borderRadius: 8 }}>
                <img
                  src={captchaImg}
                  alt="Desafio CAPTCHA"
                  style={{ display: "block" }}
                />
              </div>

              <input
                ref={inputCaptchaRef}
                type="text"
                placeholder="Digite aqui"
                value={respostaCaptcha}
                onChange={(e) => setRespostaCaptcha(e.target.value)}
                maxLength={10}
                autoComplete="off"
                disabled={enviandoCaptcha}
                style={{
                  padding: "10px 14px",
                  fontSize: 20,
                  textAlign: "center",
                  letterSpacing: 4,
                  width: 200,
                  background: "#1e293b",
                  border: avisoErroCaptcha
                    ? "2px solid #ef4444"
                    : "2px solid #f59e0b",
                  borderRadius: 8,
                  color: "#fff",
                  fontWeight: "bold",
                  cursor: enviandoCaptcha ? "not-allowed" : "text",
                  opacity: enviandoCaptcha ? 0.6 : 1,
                }}
              />

              <button
                type="submit"
                disabled={enviandoCaptcha || !respostaCaptcha.trim()}
                style={{
                  padding: "10px 28px",
                  background: enviandoCaptcha ? "#475569" : "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: "bold",
                  fontSize: 14,
                  cursor:
                    enviandoCaptcha || !respostaCaptcha.trim()
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {enviandoCaptcha ? "Validando no tribunal..." : "Confirmar"}
              </button>
            </form>
          </div>
        )}

        {modoAba === "individual" && resultadoAtual && (
          <div
            style={{
              background: "rgba(17, 24, 39, 0.85)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
              textAlign: "left",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                paddingBottom: 14,
                marginBottom: 18,
              }}
            >
              <div style={{ textAlign: "left" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    color: "#94a3b8",
                    display: "block",
                    textAlign: "left",
                  }}
                >
                  Processo Identificado
                </span>
                <h2
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 22,
                    color: "#f8fafc",
                    fontFamily: "monospace",
                    textAlign: "left",
                  }}
                >
                  {resultadoAtual.numeroProcesso}
                </h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    background: "#1e3a8a",
                    color: "#93c5fd",
                    padding: "6px 14px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: "bold",
                    border: "1px solid rgba(147, 197, 253, 0.3)",
                  }}
                >
                  {resultadoAtual.tribunal}
                </span>

                {/* Só exibe o botão Salvar se o processo ainda NÃO estiver gravado no banco */}
                {!processosSalvos.some(
                  (p) =>
                    p.numeroProcesso === resultadoAtual.numeroProcesso &&
                    p.tribunal === resultadoAtual.tribunal
                ) && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(
                          `${API_BASE}/api/Processos/salvar`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(resultadoAtual),
                          }
                        );
                        if (res.ok) {
                          await carregarProcessosDoBanco();
                          alert("Processo salvo com sucesso!");
                        } else {
                          alert("Erro ao salvar processo no banco.");
                        }
                      } catch {
                        alert("Erro de conexão ao salvar processo.");
                      }
                    }}
                    title="Salvar no Banco de Dados"
                    style={{
                      background: "#1e293b",
                      border: "1px solid #475569",
                      color: "#4ade80",
                      padding: "6px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    💾 Salvar
                  </button>
                )}

                <button
                  onClick={() => setResultadoAtual(null)}
                  title="Fechar detalhes"
                  style={{
                    background: "rgba(220, 38, 38, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                    padding: "6px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
                marginBottom: 20,
              }}
            >
              {/* <div>
                <span
                  style={{ fontSize: 12, color: "#94a3b8", display: "block" }}
                >
                  Número do Processo
                </span>
                <strong style={{ fontSize: 14, fontFamily: "monospace" }}>
                  {resultadoAtual.numeroProcesso}
                </strong>
              </div> */}
              <div>
                <span
                  style={{ fontSize: 12, color: "#94a3b8", display: "block" }}
                >
                  Data de Distribuição
                </span>
                <strong>
                  {resultadoAtual.dataDistribuicao
                    ? new Date(
                        resultadoAtual.dataDistribuicao
                      ).toLocaleDateString("pt-BR")
                    : "Não identificada"}
                </strong>
              </div>
              <div>
                <span
                  style={{ fontSize: 12, color: "#94a3b8", display: "block" }}
                >
                  Foro / Órgão Julgador
                </span>
                <strong>{resultadoAtual.foro || "Não informado"}</strong>
              </div>
              <div>
                <span
                  style={{ fontSize: 12, color: "#94a3b8", display: "block" }}
                >
                  Classe Judicial
                </span>
                <strong>{resultadoAtual.classe || "Não informada"}</strong>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <span
                  style={{ fontSize: 12, color: "#94a3b8", display: "block" }}
                >
                  Assunto
                </span>
                <strong>{resultadoAtual.assunto || "Não informado"}</strong>
              </div>
            </div>

            <div
              style={{
                marginBottom: 18,
                padding: 16,
                background: "#1e293b",
                borderRadius: 8,
                border: "1px solid #334155",
              }}
            >
              <h4
                style={{ margin: "0 0 10px 0", fontSize: 14, color: "#cbd5e1" }}
              >
                Partes do Processo ({resultadoAtual.partes?.length || 0})
              </h4>
              {resultadoAtual.partes && resultadoAtual.partes.length > 0 ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {resultadoAtual.partes.map((parte, i) => (
                    <div
                      key={i}
                      style={{ fontSize: 13, display: "flex", gap: 8 }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: "#94a3b8",
                          minWidth: 120,
                        }}
                      >
                        {parte.tipo || parte.papel || "Parte"}:
                      </span>
                      <span style={{ color: "#f1f5f9" }}>{parte.nome}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  Não há partes listadas publicamente.
                </p>
              )}
            </div>

            <div
              style={{
                padding: 16,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 8,
              }}
            >
              <h4
                style={{
                  margin: "0 0 10px 0",
                  fontSize: 14,
                  color: "#cbd5e1",
                  textAlign: "left",
                }}
              >
                Última Movimentação Registrada
              </h4>

              <div
                style={{
                  fontSize: 13,
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    color: "#94a3b8",
                    minWidth: 120,
                  }}
                >
                  {resultadoAtual.dataUltimoAndamento
                    ? new Date(
                        resultadoAtual.dataUltimoAndamento
                      ).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : "Data não identificada"}
                </span>
                <span style={{ color: "#e2e8f0", lineHeight: 1.5 }}>
                  {resultadoAtual.ultimoAndamento ||
                    "Sem movimentações adicionais registradas."}
                </span>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            background: "rgba(17, 24, 39, 0.8)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 12,
            padding: 24,
            textAlign: "left",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, color: "#f8fafc" }}>
              Processos Salvos
            </h3>
          </div>

          {processosSalvos.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#64748b",
                textAlign: "center",
                padding: 20,
              }}
            >
              Nenhum processo salvo no banco até o momento.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#1e293b",
                      borderBottom: "1px solid #334155",
                      color: "#94a3b8",
                    }}
                  >
                    <th style={{ padding: 12 }}>Tribunal</th>
                    <th style={{ padding: 12 }}>Número</th>
                    <th style={{ padding: 12 }}>Classe</th>
                    <th style={{ padding: 12 }}>Foro</th>
                    <th style={{ padding: 12 }}>Distribuição</th>
                    <th style={{ padding: 12, textAlign: "center" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {processosSalvos.map((proc, index) => (
                    <tr
                      key={index}
                      style={{ borderBottom: "1px solid #1f2937" }}
                    >
                      <td
                        style={{
                          padding: 12,
                          fontWeight: 600,
                          color: "#60a5fa",
                        }}
                      >
                        {proc.tribunal}
                      </td>
                      <td style={{ padding: 12, fontFamily: "monospace" }}>
                        {proc.numeroProcesso}
                      </td>
                      <td style={{ padding: 12 }}>{proc.classe || "-"}</td>
                      <td style={{ padding: 12 }}>{proc.foro || "-"}</td>
                      <td style={{ padding: 12 }}>
                        {proc.dataDistribuicao
                          ? new Date(proc.dataDistribuicao).toLocaleDateString(
                              "pt-BR"
                            )
                          : "-"}
                      </td>
                      <td
                        style={{
                          padding: 12,
                          display: "flex",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        <button
                          onClick={() => {
                            setResultadoAtual(proc);
                            setModoAba("individual");
                            window.scrollTo({ top: 120, behavior: "smooth" });
                          }}
                          style={{
                            padding: "4px 10px",
                            background: "#1e293b",
                            border: "1px solid #475569",
                            color: "#93c5fd",
                            borderRadius: 4,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Ver Detalhes
                        </button>

                        <button
                          onClick={() =>
                            handleAtualizarProcesso(
                              proc.numeroProcesso,
                              proc.tribunal
                            )
                          }
                          disabled={abasBloqueadas}
                          title="Buscar novas informações no tribunal"
                          style={{
                            padding: "4px 8px",
                            background: "rgba(59, 130, 246, 0.15)",
                            border: "1px solid rgba(59, 130, 246, 0.4)",
                            color: "#60a5fa",
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: abasBloqueadas ? "not-allowed" : "pointer",
                          }}
                        >
                          🔄
                        </button>

                        <button
                          onClick={() =>
                            handleExcluirProcesso(
                              proc.numeroProcesso,
                              proc.tribunal
                            )
                          }
                          title="Excluir do Banco de Dados"
                          style={{
                            padding: "4px 8px",
                            background: "rgba(220, 38, 38, 0.15)",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            color: "#f87171",
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
