# Ixora — checklist de testes em dispositivo Android (real device)

Documento para validação manual do app como produto mobile **em hardware real** (não substitui testes automatizados). Atualize a coluna **Status** e **Notes** a cada rodada de QA ou antes de release.

**Como usar**

1. Gere um build **sem live reload** (release ou debug assinado instalável via APK/Android Studio).
2. Instale em um ou mais aparelhos representativos (Android 10+, notch, gestural nav, fabricantes diferentes).
3. Percorra as seções **A–J**; marque Status como `Pass` / `Fail` / `Blocked` / `N/A`.
4. Para regressões rápidas antes de merge/release, use também [`android-smoke-test.md`](./android-smoke-test.md).

**Legenda — Status**

| Valor    | Significado                                      |
| -------- | ------------------------------------------------ |
| Pass     | Comportamento conforme esperado                  |
| Fail     | Bug ou divergência — anotar em Notes             |
| Blocked  | Impossível testar (ambiente, conta, hardware)    |
| N/A      | Não aplicável à build ou cenário atual           |

---

## A. Instalação / build

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Build instalável sem live reload | `./gradlew assembleDebug` ou pipeline CI; instalar APK no device | App instala sem erro; ícone correto | | |
| Primeira abertura | Abrir app após instalação fria | Splash/auth/carregamento sem crash | | |
| Cold start | Force-stop → abrir | App inicia; estado coerente (sessão ou login) | | |
| Warm start | Home → reabrir pelo launcher | Retorno rápido sem crash | | |
| Encerrar app | Recentes → fechar swipe | Sem crash ao matar processo | | |
| Limpar dados | Configurações Android → Armazenamento → Limpar dados | Próxima abertura = estado “zerado” (logout/local) | | |

---

## B. Auth (Firebase)

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Login email/senha | Conta válida | Entra em tabs/home sem erro persistente | | |
| Login credencial inválida | Email/senha errados | Mensagem de erro clara; sem crash | | |
| Cadastro | Fluxo sign-up completo | Conta criada ou erro tratado | | |
| Reset password | Forgot password → email | Fluxo Firebase ok (email recebido se configurado) | | |
| Google Sign-In nativo | Continue with Google (Capacitor) | Token/login ok; retorno ao app | | |
| Logout | Settings → Sign out | Sessão encerra; não vaza dados sensíveis na UI | | |

---

## C. Vibes

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Listar vibes | My Vibes com conta com dados | Lista carrega; cards/artwork ok | | |
| Empty state | Conta sem vibes | Empty state + CTA coerente | | |
| Criar vibe | Create → salvar | Nova vibe aparece na lista | | |
| Editar vibe | Edit → alterar nome/descrição | Persiste após refresh | | |
| Deletar vibe | Delete → confirmar | Some da lista; sem crash | | |
| Erro de lista | Simular falha de rede na lista | Error state + retry | | |

---

## D. Player (NativeAudio)

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Play | Abrir player → Play | Áudio inicia; estado Playing | | |
| Pause | Durante play → Pause | Pausa imediata | | |
| Resume | Após pause → Play | Retoma sem restart indesejado | | |
| Stop | Menu ⋮ → Stop vibe | Para sessão; estado idle/MiniPlayer conforme design | | |
| Restart | Menu ⋮ → Restart | Reinicia mix conforme plano | | |
| Modo once | Vibe com layer once | Comportamento esperado até fim do clip/layer | | |
| Modo loop | Vibe com layer loop | Loop estável | | |
| Modo interval | Vibe com interval válido | Repetições com gap esperado | | |
| Tap repetido no Play | Toques rápidos no botão central | Sem double-start grave; UI estável | | |
| Troca de vibe | Player A tocando → abrir Player B e dar Play | Troca ou mensagem “outra vibe”; sem travamento | | |
| Vibe sem sons | Player sem sounds configurados | Warning/empty; sem crash ao Play | | |
| Loading / Preparing | Observar ao iniciar play | Estados visuais claros; não trava indefinidamente | | |

---

## E. Background audio

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Home button | Play → Home | Áudio continua | | |
| Lock screen | Play → bloquear | Reprodução continua; arte/título coerentes na lock | | |
| Voltar ao app | Após background → reabrir | UI sincronizada com estado real | | |
| Notification | Shade → controles de mídia | Play/pause respondem (MediaSession) | | |
| Media controls | Bluetooth/fones com controles físicos | Pause/play respeitam foco | | |
| Task removed | Play → remover app dos recentes | Conforme política atual (ex.: áudio pode parar — documentar comportamento observado) | | |

---

## F. Audio focus

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Outro app de mídia | Spotify/YouTube em paralelo | Duck/pause/resume conforme implementação de audio focus | | |
| Notificação sonora | Recebimento de alerta do sistema | Mix pode pausar ou duck — não crash | | |
| Ligação (se possível) | Chamada entrante durante play | Áudio cede; retorno ok após chamada | | |
| Desconectar fone BT | Durante play | Roteamento atualiza ou pausa de forma previsível | | |
| Desconectar wired | Idem | Sem crash | | |

---

## G. Offline

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Download for offline | Menu player → download (nativo) | Conclui; badge/indicação “available offline” | | |
| Modo avião | Após download → avião ON | Player abre vibe baixada; reproduz | | |
| Snapshot metadata | Avião + vibe só via snapshot | Empty/offline messaging correto se sem dados | | |
| Sair e voltar ao player | Background → voltar offline | Estado consistente | | |
| Remover download | Menu ou Settings | Arquivos/indicadores atualizados | | |
| Settings → Downloads | Lista vazia / com itens | Empty state premium; remoção ok | | |
| Vibe não baixada offline | Avião; vibe sem download | Mensagem “not available offline” + orientação | | |

---

## H. UI / visual

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Light mode | Settings → Light | Tokens legíveis | | |
| Dark mode | Settings → Dark | Contraste ok | | |
| System mode | Settings → System | Segue SO após troca | | |
| Status bar (player) | Rota full-screen player | Ícones claros/escuros coerentes (`statusBarTheme`) | | |
| Safe area | Notch / gesture bar | Conteúdo não cortado | | |
| Tab bar | Navegar tabs | MiniPlayer não sobrepõe conteúdo crítico onde aplicável | | |
| MiniPlayer | Play → voltar às tabs | Barra aparece; navega ao player ao tocar | | |
| Player visual | Fundo/gradiente/badges | Sem regressão visual óbvia | | |
| Empty / loading / error | Forçar cada estado | Componentes App*State consistentes | | |
| Motion | Navegação normal | Transições suaves | | |
| Reduced motion | Config Android → remover animações | Sem loops incômodos; UI utilizável | | |

---

## I. Network / API

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| API offline | Wi-Fi/dados off (sem modo avião se precisar APIs) | Mensagens claras; offline paths quando aplicável | | |
| API 500 / erro servidor | Mitigar via proxy ou ambiente | Error state; retry onde existir | | |
| Token expirado | Simular sessão expirada (se possível) | Redirect/login; sem estado inconsistente | | |
| Reconectar | Cortar rede → restaurar | Recuperação de listas/player conforme esperado | | |

---

## J. Performance / bateria

| Test case | Steps | Expected result | Status | Notes |
| --------- | ----- | --------------- | ------ | ----- |
| Sessão longa | Play ≥ 10 min | Sem cortes graves; sem memory leak óbvio | | |
| Background prolongado | Play → background 10+ min | Áudio estável ou comportamento documentado | | |
| Tela bloqueada | Play → lock por vários minutos | Continua tocando se esperado | | |
| Aquecimento | Observação subjetiva após uso longo | Anotar modelo/device e duração | | |
| Bateria | Idem | Consumo “aceitável” para sessão de áudio | | |

---

## Known issues / notes

Use esta seção como âncora entre QA e engenharia. Atualize quando o comportamento mudar.

| Tópico | Nota |
| ------ | ---- |
| Fade-in / fade-out | Transições de fade na engine/plugin foram **removidas ou limitadas temporariamente** por compatibilidade/complexidade com NativeAudio — ver [`issues/audio-engine-fade-limitations.md`](./issues/audio-engine-fade-limitations.md) e [`issues/native-loop-fadein.md`](./issues/native-loop-fadein.md). |
| NativeAudio / Capgo | Limitações e customizações Android documentadas em [`android-native-customizations.md`](./android-native-customizations.md). |
| Offline | Arquivos offline via **Capacitor Filesystem** (e fluxos associados); não há SQLite local de vibes completo no cliente como backend — **SQLite local futuro** pode mudar estratégia de cache. |
| Plugin próprio | Evolução possível para **plugin Capacitor próprio** para media/foco/offline — comportamentos atuais podem mudar após migração. |
| Task removed | Comportamento ao remover app da lista de recentes durante playback deve ser validado explicitamente e alinhado ao produto (ver seção E). |

---

## Referências internas

- [`android-smoke-test.md`](./android-smoke-test.md) — checklist curto pré-merge/release  
- [`android-native-customizations.md`](./android-native-customizations.md)  
- [`artwork-background-strategy.md`](./artwork-background-strategy.md)  
- [`audio-cache.md`](./audio-cache.md)  
