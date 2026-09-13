import { useState, useEffect, useRef, useMemo } from "react";

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
  const [termoBuscaSalvos, setTermoBuscaSalvos] = useState("");

  const [filaLote, setFilaLote] = useState([]);
  const [executandoLote, setExecutandoLote] = useState(false);

  const [processoAtualEmExecucao, setProcessoAtualEmExecucao] = useState("");
  const [carregandoIndividual, setCarregandoIndividual] = useState(false);

  // Painéis de detalhes exclusivos para cada aba
  const [resultadoIndividual, setResultadoIndividual] = useState(null);
  const [resultadoLote, setResultadoLote] = useState(null);

  const [erro, setErro] = useState(null);

  // Status de feedback do CAPTCHA em tempo real (booleano)
  const [resolvendoCaptchaIndividual, setResolvendoCaptchaIndividual] =
    useState(false);

  const [opcoesGrau, setOpcoesGrau] = useState([]);
  const [selecionandoGrau, setSelecionandoGrau] = useState(false);

  const [processosSalvos, setProcessosSalvos] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(false);

  const [pontosLoading, setPontosLoading] = useState("");

  const abortControllerRef = useRef(null);
  const canceladoManualmenteRef = useRef(false);
  const consultouGrauRef = useRef(false);

  const emProcessamento = carregandoIndividual || executandoLote;
  const abasBloqueadas = emProcessamento || opcoesGrau.length > 0;
  const sessionIdAtual = processoAtualEmExecucao.replace(/\D/g, "");

  useEffect(() => {
    carregarProcessosDoBanco();
  }, []);

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
      // backend pode estar iniciando
    } finally {
      setCarregandoLista(false);
    }
  };

  const handleExcluirProcesso = async (numeroProcesso, tribunal, grau = 1) => {
    const confirmou = window.confirm(
      `Deseja realmente excluir o processo ${numeroProcesso} (${tribunal} - ${grau}º Grau) do banco de dados?`
    );
    if (!confirmou) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/Processos/${encodeURIComponent(
          tribunal
        )}/${grau}/${encodeURIComponent(numeroProcesso)}`,
        {
          method: "DELETE",
        }
      );

      if (res.ok) {
        if (
          resultadoIndividual?.numeroProcesso === numeroProcesso &&
          resultadoIndividual?.tribunal === tribunal &&
          (resultadoIndividual?.grau || 1) === grau
        ) {
          setResultadoIndividual(null);
        }
        if (
          resultadoLote?.numeroProcesso === numeroProcesso &&
          resultadoLote?.tribunal === tribunal &&
          (resultadoLote?.grau || 1) === grau
        ) {
          setResultadoLote(null);
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

  const handleAtualizarProcesso = async (
    numeroProcesso,
    tribunal,
    grau = 1
  ) => {
    const confirmou = window.confirm(
      `Deseja buscar novas informações do processo ${numeroProcesso} (${grau}º Grau)? Ele será re-extraído do tribunal para atualizar os dados.`
    );
    if (!confirmou) return;

    try {
      await fetch(
        `${API_BASE}/api/Processos/${encodeURIComponent(
          tribunal
        )}/${grau}/${encodeURIComponent(numeroProcesso)}`,
        {
          method: "DELETE",
        }
      );
      await carregarProcessosDoBanco();
    } catch {
      // continua para extrair mesmo se houver falha prévia de delete
    }

    setModoAba("individual");
    setNumeroInput(numeroProcesso);
    setResultadoIndividual(null);
    setErro(null);
    setResolvendoCaptchaIndividual(false);
    setCarregandoIndividual(true);
    canceladoManualmenteRef.current = false;
    abortControllerRef.current = new AbortController();

    window.scrollTo({ top: 0, behavior: "smooth" });

    const resultado = await executarExtracaoProcesso(
      numeroProcesso,
      abortControllerRef.current.signal
    );

    if (resultado.sucesso) {
      setResultadoIndividual(resultado.dados);

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
        // silencia erro
      }
    } else if (!canceladoManualmenteRef.current) {
      setErro(resultado.erro);
    }

    setCarregandoIndividual(false);
    setResolvendoCaptchaIndividual(false);
    abortControllerRef.current = null;
  };

  // Polling dinâmico do CAPTCHA e seleção de Grau
  useEffect(() => {
    let timerId = null;
    let cancelado = false;

    const ehTrt = /\.5\.(0?[24]|12|15)\./.test(processoAtualEmExecucao);

    const executarCicloPolling = async () => {
      if (cancelado || !emProcessamento || !sessionIdAtual || !ehTrt) return;

      let proximoDelay = 2200;

      try {
        if (!consultouGrauRef.current && opcoesGrau.length === 0) {
          const resGrau = await fetch(
            `${API_BASE}/api/Captcha/opcoes-grau/${sessionIdAtual}`
          );
          if (resGrau.ok) {
            const dataGrau = await resGrau.json();
            const lista = dataGrau.opcoes || dataGrau.Opcoes;
            if (Array.isArray(lista) && lista.length > 0) {
              setOpcoesGrau(lista);
              consultouGrauRef.current = true;
            }
          }
        }

        const resStatus = await fetch(
          `${API_BASE}/api/Captcha/status/${sessionIdAtual}`
        );

        if (resStatus.status === 200) {
          const dataStatus = await resStatus.json();
          const emAndamento = Boolean(dataStatus && dataStatus.tentativa);

          setResolvendoCaptchaIndividual(emAndamento);

          setFilaLote((prev) =>
            prev.map((item) =>
              item.numero.replace(/\D/g, "") === sessionIdAtual
                ? { ...item, resolvendoCaptcha: emAndamento }
                : item
            )
          );

          proximoDelay = 900;
        } else {
          setResolvendoCaptchaIndividual(false);
          setFilaLote((prev) =>
            prev.map((item) =>
              item.numero.replace(/\D/g, "") === sessionIdAtual
                ? { ...item, resolvendoCaptcha: false }
                : item
            )
          );
          proximoDelay = 2200;
        }
      } catch {
        proximoDelay = 2500;
      }

      if (!cancelado && emProcessamento) {
        timerId = setTimeout(executarCicloPolling, proximoDelay);
      }
    };

    if (emProcessamento && sessionIdAtual && ehTrt) {
      timerId = setTimeout(executarCicloPolling, 1800);
    }

    return () => {
      cancelado = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [
    emProcessamento,
    sessionIdAtual,
    opcoesGrau.length,
    processoAtualEmExecucao,
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
      } catch {}
    }

    setCarregandoIndividual(false);
    setExecutandoLote(false);
    setProcessoAtualEmExecucao("");
    setResolvendoCaptchaIndividual(false);
    setOpcoesGrau([]);
    consultouGrauRef.current = false;

    setFilaLote((prev) =>
      prev.map((item) =>
        item.status === "pendente" || item.status === "executando"
          ? {
              ...item,
              status: "erro",
              erro: "Operação cancelada pelo usuário.",
              resolvendoCaptcha: false,
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
    setResolvendoCaptchaIndividual(false);
    consultouGrauRef.current = false;

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
      setProcessoAtualEmExecucao("");
    }
  };

  // SEMPRE consulta no tribunal ao vivo, sem barrar por existir no banco
  const handleConsultaIndividual = async (e) => {
    if (e) e.preventDefault();
    const numeroLimpo = numeroInput.trim();
    if (!numeroLimpo) return;

    canceladoManualmenteRef.current = false;
    abortControllerRef.current = new AbortController();

    setCarregandoIndividual(true);
    setResultadoIndividual(null);
    setErro(null);
    setResolvendoCaptchaIndividual(false);

    const resultado = await executarExtracaoProcesso(
      numeroLimpo,
      abortControllerRef.current.signal
    );

    if (resultado.sucesso) {
      setResultadoIndividual(resultado.dados);
    } else if (!canceladoManualmenteRef.current) {
      setErro(resultado.erro);
    }

    setCarregandoIndividual(false);
    setResolvendoCaptchaIndividual(false);
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
      resolvendoCaptcha: false,
      erro: null,
      dados: null,
    }));

    setFilaLote(itensIniciais);
    setExecutandoLote(true);
    setErro(null);

    for (let i = 0; i < itensIniciais.length; i++) {
      if (canceladoManualmenteRef.current) break;

      const numAtual = itensIniciais[i].numero;
      const sessionAtual = numAtual.replace(/\D/g, "");

      abortControllerRef.current = new AbortController();

      setFilaLote((prev) =>
        prev.map((item, idx) =>
          idx === i
            ? { ...item, status: "executando", resolvendoCaptcha: false }
            : item
        )
      );

      // Dispara a extração
      const extrairPromise = executarExtracaoProcesso(
        numAtual,
        abortControllerRef.current.signal
      );

      // Se houver múltiplas instâncias no PJe, detecta e seleciona a primeira automaticamente
      let opcoesDetectadas = null;
      for (let t = 0; t < 8; t++) {
        if (canceladoManualmenteRef.current) break;
        await new Promise((r) => setTimeout(r, 600));

        try {
          const resOpcoes = await fetch(
            `${API_BASE}/api/Captcha/opcoes-grau/${sessionAtual}`
          );
          if (resOpcoes.ok) {
            const dataOpcoes = await resOpcoes.json();
            const lista = dataOpcoes.opcoes || dataOpcoes.Opcoes;
            if (Array.isArray(lista) && lista.length > 0) {
              opcoesDetectadas = lista;
              // Seleciona a primeira opção (grau 1/índice 0)
              await fetch(
                `${API_BASE}/api/Captcha/selecionar-grau/${sessionAtual}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    indice: lista[0].indice ?? lista[0].Indice ?? 0,
                  }),
                }
              );
              break;
            }
          }
        } catch {}
      }

      const resultado = await extrairPromise;

      if (canceladoManualmenteRef.current) break;

      if (resultado.sucesso) {
        // Salva a primeira instância obtida diretamente no banco
        try {
          await fetch(`${API_BASE}/api/Processos/salvar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resultado.dados),
          });
          await carregarProcessosDoBanco();
        } catch {}

        // Se houver múltiplas instâncias (ex: 2º Grau também), extrai e salva sequencialmente
        if (opcoesDetectadas && opcoesDetectadas.length > 1) {
          for (let opIdx = 1; opIdx < opcoesDetectadas.length; opIdx++) {
            if (canceladoManualmenteRef.current) break;
            const extrairSegundaPromise = executarExtracaoProcesso(
              numAtual,
              abortControllerRef.current.signal
            );

            // Aguarda o painel abrir e clica na próxima instância
            for (let t2 = 0; t2 < 10; t2++) {
              await new Promise((r) => setTimeout(r, 600));
              try {
                const resOpcoes = await fetch(
                  `${API_BASE}/api/Captcha/opcoes-grau/${sessionAtual}`
                );
                if (resOpcoes.ok) {
                  const dataOpcoes = await resOpcoes.json();
                  const lista = dataOpcoes.opcoes || dataOpcoes.Opcoes;
                  if (Array.isArray(lista) && lista.length > 0) {
                    await fetch(
                      `${API_BASE}/api/Captcha/selecionar-grau/${sessionAtual}`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          indice:
                            opcoesDetectadas[opIdx].indice ??
                            opcoesDetectadas[opIdx].Indice ??
                            opIdx,
                        }),
                      }
                    );
                    break;
                  }
                }
              } catch {}
            }

            const resSegunda = await extrairSegundaPromise;
            if (resSegunda.sucesso) {
              try {
                await fetch(`${API_BASE}/api/Processos/salvar`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(resSegunda.dados),
                });
                await carregarProcessosDoBanco();
              } catch {}
            }
          }
        }
      }

      setFilaLote((prev) =>
        prev.map((item, idx) => {
          if (idx === i) {
            return resultado.sucesso
              ? {
                  ...item,
                  status: "sucesso",
                  dados: resultado.dados,
                  resolvendoCaptcha: false,
                }
              : {
                  ...item,
                  status: "erro",
                  erro: resultado.erro,
                  resolvendoCaptcha: false,
                };
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

  // avalia se o processo não existe no banco OU se possui dados diferentes
  const checarSeTemAlteracao = (resultado) => {
    if (!resultado) return false;

    const noBanco = processosSalvos.find(
      (p) =>
        p.numeroProcesso.replace(/\D/g, "") ===
          resultado.numeroProcesso.replace(/\D/g, "") &&
        p.tribunal.trim().toUpperCase() ===
          resultado.tribunal.trim().toUpperCase() &&
        (p.grau || 1) === (resultado.grau || 1)
    );

    if (!noBanco) return true;

    const normalizar = (txt) => (txt || "").trim().toLowerCase();

    const mudouAndamento =
      normalizar(noBanco.ultimoAndamento) !==
      normalizar(resultado.ultimoAndamento);
    const mudouClasse =
      normalizar(noBanco.classe) !== normalizar(resultado.classe);
    const mudouForo = normalizar(noBanco.foro) !== normalizar(resultado.foro);
    const mudouAssunto =
      normalizar(noBanco.assunto) !== normalizar(resultado.assunto);

    const formatarData = (d) =>
      d ? new Date(d).toISOString().slice(0, 10) : "";
    const mudouDataAndamento =
      formatarData(noBanco.dataUltimoAndamento) !==
      formatarData(resultado.dataUltimoAndamento);

    const qtdPartesBanco = noBanco.partes?.length || 0;
    const qtdPartesAtual = resultado.partes?.length || 0;
    const mudouPartes = qtdPartesBanco !== qtdPartesAtual;

    return (
      mudouAndamento ||
      mudouDataAndamento ||
      mudouClasse ||
      mudouForo ||
      mudouAssunto ||
      mudouPartes
    );
  };

  const temAlteracaoParaSalvarIndividual = useMemo(
    () => checarSeTemAlteracao(resultadoIndividual),
    [resultadoIndividual, processosSalvos]
  );

  const temAlteracaoParaSalvarLote = useMemo(
    () => checarSeTemAlteracao(resultadoLote),
    [resultadoLote, processosSalvos]
  );

  // filtro de Processos Salvos pela Search Box
  const processosSalvosFiltrados = useMemo(() => {
    if (!termoBuscaSalvos.trim()) return processosSalvos;
    const termo = termoBuscaSalvos.toLowerCase().trim();
    const termoApenasDigitos = termo.replace(/\D/g, "");

    return processosSalvos.filter((p) => {
      const matchTexto =
        p.numeroProcesso.toLowerCase().includes(termo) ||
        p.tribunal.toLowerCase().includes(termo) ||
        (p.foro && p.foro.toLowerCase().includes(termo)) ||
        (p.classe && p.classe.toLowerCase().includes(termo));

      const matchDigitos =
        termoApenasDigitos.length > 0 &&
        p.numeroProcesso.replace(/\D/g, "").includes(termoApenasDigitos);

      return matchTexto || matchDigitos;
    });
  }, [processosSalvos, termoBuscaSalvos]);

  const totalLote = filaLote.length;
  const concluidosLote = filaLote.filter(
    (item) => item.status === "sucesso" || item.status === "erro"
  ).length;
  const porcentagemLote =
    totalLote > 0 ? Math.round((concluidosLote / totalLote) * 100) : 0;

  // Renderizador reutilizável de painel de detalhes do processo
  const renderCardDetalhes = (dados, temAlteracao, onFechar) => {
    if (!dados) return null;
    const grauInt = dados.grau || 1;

    return (
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
              {dados.numeroProcesso}
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
              {dados.tribunal}
            </span>

            <span
              style={{
                background:
                  grauInt === 2
                    ? "rgba(168, 85, 247, 0.2)"
                    : "rgba(59, 130, 246, 0.2)",
                color: grauInt === 2 ? "#d8b4fe" : "#93c5fd",
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: "bold",
                border:
                  grauInt === 2
                    ? "1px solid rgba(168, 85, 247, 0.4)"
                    : "1px solid rgba(59, 130, 246, 0.4)",
              }}
            >
              {grauInt}º Grau
            </span>

            {temAlteracao ? (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(
                      `${API_BASE}/api/Processos/salvar`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(dados),
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
            ) : (
              <span
                style={{
                  fontSize: 12,
                  color: "#94a3b8",
                  background: "#1e293b",
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                }}
              >
                ✓ Sincronizado
              </span>
            )}

            <button
              onClick={onFechar}
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
          <div>
            <span style={{ fontSize: 12, color: "#94a3b8", display: "block" }}>
              Data de Distribuição
            </span>
            <strong>
              {dados.dataDistribuicao
                ? new Date(dados.dataDistribuicao).toLocaleDateString("pt-BR")
                : "Não identificada"}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: 12, color: "#94a3b8", display: "block" }}>
              Foro / Órgão Julgador
            </span>
            <strong>{dados.foro || "Não informado"}</strong>
          </div>
          <div>
            <span style={{ fontSize: 12, color: "#94a3b8", display: "block" }}>
              Classe Judicial
            </span>
            <strong>{dados.classe || "Não informada"}</strong>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 12, color: "#94a3b8", display: "block" }}>
              Assunto
            </span>
            <strong>{dados.assunto || "Não informado"}</strong>
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
          <h4 style={{ margin: "0 0 10px 0", fontSize: 14, color: "#cbd5e1" }}>
            Partes do Processo ({dados.partes?.length || 0})
          </h4>
          {dados.partes && dados.partes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dados.partes.map((parte, i) => (
                <div key={i} style={{ fontSize: 13, display: "flex", gap: 8 }}>
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
              {dados.dataUltimoAndamento
                ? new Date(dados.dataUltimoAndamento).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                : "Data não identificada"}
            </span>
            <span style={{ color: "#e2e8f0", lineHeight: 1.5 }}>
              {dados.ultimoAndamento ||
                "Sem movimentações adicionais registradas."}
            </span>
          </div>
        </div>
      </div>
    );
  };

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
            <a
              href="https://github.com/decryptr/captcha"
              target="_blank"
              rel="noreferrer"
              title="decryptr/captcha"
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
                src="https://raw.githubusercontent.com/decryptr/captcha/refs/heads/master/man/figures/hex_small.png"
                alt="decryptr/captcha"
                style={{ width: 26, height: 26 }}
              />
            </a>
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
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div>
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

                  {resolvendoCaptchaIndividual && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#f59e0b",
                        fontWeight: 600,
                        background: "rgba(245, 158, 11, 0.15)",
                        padding: "4px 12px",
                        borderRadius: 6,
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                      }}
                    >
                      ⚠️ Resolvendo CAPTCHA
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
                      setResultadoIndividual(null);
                      setErro(null);
                      setResolvendoCaptchaIndividual(false);
                      canceladoManualmenteRef.current = false;
                      abortControllerRef.current = new AbortController();
                      executarExtracaoProcesso(
                        p.numero,
                        abortControllerRef.current.signal
                      ).then((res) => {
                        if (res.sucesso) {
                          setResultadoIndividual(res.dados);
                        } else if (!canceladoManualmenteRef.current) {
                          setErro(res.erro);
                        }
                        setCarregandoIndividual(false);
                        setResolvendoCaptchaIndividual(false);
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

        {/* Card de Detalhe da Aba Individual */}
        {modoAba === "individual" &&
          resultadoIndividual &&
          renderCardDetalhes(
            resultadoIndividual,
            temAlteracaoParaSalvarIndividual,
            () => setResultadoIndividual(null)
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
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
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

                            {item.resolvendoCaptcha && (
                              <span
                                style={{
                                  color: "#f59e0b",
                                  fontWeight: 600,
                                  fontSize: 12,
                                  background: "rgba(245, 158, 11, 0.15)",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  border: "1px solid rgba(245, 158, 11, 0.3)",
                                }}
                              >
                                ⚠️ Resolvendo CAPTCHA
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
                          </div>
                        )}
                        {item.status === "sucesso" && (
                          <>
                            <span
                              style={{
                                fontSize: 12,
                                color: "#4ade80",
                                background: "rgba(34, 197, 94, 0.15)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                border: "1px solid rgba(34, 197, 94, 0.3)",
                              }}
                            >
                              💾 Salvo no Banco
                            </span>
                            <span
                              style={{ color: "#4ade80", fontWeight: "bold" }}
                            >
                              ✅ Coletado
                            </span>
                            <button
                              onClick={() => {
                                setResultadoLote(item.dados);
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

        {/* Card de Detalhe Exclusivo da Aba de Lote */}
        {modoAba === "lote" &&
          resultadoLote &&
          renderCardDetalhes(resultadoLote, temAlteracaoParaSalvarLote, () =>
            setResultadoLote(null)
          )}

        {/* Modal de Instâncias Múltiplas */}
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
                  key={opcao.indice ?? opcao.Indice}
                  onClick={() =>
                    handleSelecionarGrau(opcao.indice ?? opcao.Indice)
                  }
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
                  {opcao.texto ?? opcao.Texto}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabela de Processos Salvos com Search Box Própria */}
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
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, color: "#f8fafc" }}>
              Processos Salvos ({processosSalvosFiltrados.length})
            </h3>

            {/* SEARCH BOX DO BANCO LOCAL */}
            <input
              type="text"
              placeholder="Buscar nos processos salvos..."
              value={termoBuscaSalvos}
              onChange={(e) => setTermoBuscaSalvos(e.target.value)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#f8fafc",
                width: 280,
                outline: "none",
              }}
            />
          </div>

          {processosSalvosFiltrados.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#64748b",
                textAlign: "center",
                padding: 20,
              }}
            >
              {processosSalvos.length === 0
                ? "Nenhum processo salvo no banco até o momento."
                : "Nenhum processo salvo encontrado para esta busca."}
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
                    <th style={{ padding: 12 }}>Instância</th>
                    <th style={{ padding: 12 }}>Número</th>
                    <th style={{ padding: 12 }}>Classe</th>
                    <th style={{ padding: 12 }}>Foro</th>
                    <th style={{ padding: 12 }}>Distribuição</th>
                    <th style={{ padding: 12, textAlign: "center" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {processosSalvosFiltrados.map((proc) => {
                    const grauInt = proc.grau || 1;
                    const chaveUnica = `${proc.numeroProcesso}-${proc.tribunal}-${grauInt}`;

                    return (
                      <tr
                        key={chaveUnica}
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
                        <td style={{ padding: 12 }}>
                          <span
                            style={{
                              background:
                                grauInt === 2
                                  ? "rgba(168, 85, 247, 0.2)"
                                  : "rgba(59, 130, 246, 0.2)",
                              color: grauInt === 2 ? "#d8b4fe" : "#93c5fd",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              border:
                                grauInt === 2
                                  ? "1px solid rgba(168, 85, 247, 0.4)"
                                  : "1px solid rgba(59, 130, 246, 0.4)",
                            }}
                          >
                            {grauInt}º Grau
                          </span>
                        </td>
                        <td style={{ padding: 12, fontFamily: "monospace" }}>
                          {proc.numeroProcesso}
                        </td>
                        <td style={{ padding: 12 }}>{proc.classe || "-"}</td>
                        <td style={{ padding: 12 }}>{proc.foro || "-"}</td>
                        <td style={{ padding: 12 }}>
                          {proc.dataDistribuicao
                            ? new Date(
                                proc.dataDistribuicao
                              ).toLocaleDateString("pt-BR")
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
                              if (modoAba === "lote") {
                                setResultadoLote(proc);
                              } else {
                                setResultadoIndividual(proc);
                              }
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
                                proc.tribunal,
                                grauInt
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
                              cursor: abasBloqueadas
                                ? "not-allowed"
                                : "pointer",
                            }}
                          >
                            🔄
                          </button>

                          <button
                            onClick={() =>
                              handleExcluirProcesso(
                                proc.numeroProcesso,
                                proc.tribunal,
                                grauInt
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer com Tribunais Suportados */}
        <footer
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            paddingTop: 24,
            marginTop: 32,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
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
        </footer>
      </div>
    </div>
  );
}
