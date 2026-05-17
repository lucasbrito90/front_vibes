# Ixora — smoke test Android (rápido)

Checklist **curto** (~15–20 min) antes de **merge importante** ou **release**. Marque `[x]` quando OK. Se algo falhar, abrir bug e expandir com [`android-real-device-testing.md`](./android-real-device-testing.md).

**Build:** APK/debug ou release **sem** live reload • **Device:** Android físico

---

## Smoke checklist

- [ ] **A1.** App instala e abre (cold start sem crash)
- [ ] **A2.** Force-stop → reabrir → estado coerente (login ou sessão)
- [ ] **B1.** Login Google nativo OU email/senha (pelo menos um fluxo principal)
- [ ] **B2.** Logout (Settings) → não fica “preso” em tela autenticada quebrada
- [ ] **C1.** My Vibes lista carrega (ou empty state correto)
- [ ] **C2.** Abrir player de uma vibe com sons → **Play** → áudio ouve-se
- [ ] **C3.** **Pause** → **Resume** funciona
- [ ] **D1.** **Stop** (menu) ou equivalente → sessão para sem crash
- [ ] **E1.** Com áudio tocando: **Home** → som **continua**
- [ ] **E2.** **Lock screen** → reprodução segue; controles na notificação/lock respondem
- [ ] **E3.** Voltar ao app → UI alinhada com play/pause real
- [ ] **F1.** Abrir **Spotify ou YouTube** em paralelo → sem crash; foco de áudio aceitável (duck/pause)
- [ ] **G1.** **Download for offline** em vibe nativa → conclui sem erro óbvio
- [ ] **G2.** **Modo avião** → vibe baixada **toca**; vibe não baixada mostra mensagem offline adequada
- [ ] **H1.** Alternar **dark / light / system** em Settings → UI legível
- [ ] **H2.** **MiniPlayer**: aparece ao sair do player com sessão ativa; tap abre player
- [ ] **H3.** Player: **status bar** não conflita com conteúdo (ícones visíveis)
- [ ] **I1.** Toggle rede (off → on) → app recupera sem ficar travado em loading eterno
- [ ] **J1.** **≥5 min** playback em background + tela bloqueada → áudio **estável** (sem precisar smoke de 10+ min neste passo)

---

## Se falhar

1. Anotar **device**, **Android version**, **build** (commit/hash).  
2. Reproduzir com passos mínimos.  
3. Preencher matriz detalhada em [`android-real-device-testing.md`](./android-real-device-testing.md) na seção correspondente.

---

## Known issues (resumo)

Fade/limitações NativeAudio, offline via Filesystem e notas de roadmap — ver **Known issues** em [`android-real-device-testing.md`](./android-real-device-testing.md).
