# AI Usage Monitor for GNOME

Um indicador na barra superior do GNOME que mostra, de relance, o quanto
das suas assinaturas de IA (Claude, ChatGPT/Codex, Gemini, GitHub Copilot)
já foi consumido — sem precisar abrir cada app pra checar.

> Monitora **consumo/cota**, nunca gastos em dinheiro.

## Por que isso existe

Se você usa mais de uma assinatura de IA no dia a dia, é fácil ser
surpreendido por um limite batendo no meio de uma tarefa importante. Esta
extensão junta tudo num só lugar: um clique na barra superior mostra
quanto falta de cada uma, e quando renova.

## O que já funciona

| IA | Status | O que mostra |
|---|---|---|
| **Claude** (Claude Code) | ✅ Dado real | Percentual real das janelas de 5h e 7 dias, direto da sua conta. |
| **Codex** (ChatGPT) | ✅ Dado real | Percentual real da janela de 5h e semanal do Codex CLI. |
| **Antigravity** (Gemini) | 🚧 Em desenvolvimento | Dados de demonstração por enquanto — nenhuma fonte real de cota foi encontrada ainda. |
| **GitHub Copilot** | 🚧 Em desenvolvimento | Dados de demonstração por enquanto — a API oficial existe, integração real ainda não foi feita. |

Claude e Codex funcionam reaproveitando o login que você já fez nos CLIs
oficiais (`claude auth login` / `codex login`) — a extensão nunca pede
senha, nunca acessa nada pela web, e nunca envia essa credencial pra
nenhum lugar além da própria API oficial do provedor. Detalhes técnicos
completos em [`docs/decisions/ADR-007-real-quota-via-cli-credentials.md`](./docs/decisions/ADR-007-real-quota-via-cli-credentials.md).

## Requisitos

- GNOME Shell 45 a 48 (testado em Zorin OS 18 / GNOME Shell 46).
- Para dado real de **Claude**: [Claude Code](https://claude.com/claude-code) instalado e logado.
- Para dado real de **Codex**: [Codex CLI](https://developers.openai.com/codex/cli) instalado e logado.
- Sem essas ferramentas, a extensão continua funcionando normalmente com
  os cards correspondentes mostrando "autenticação necessária".

## Instalação

```bash
git clone https://github.com/tiagomeconi/ai-tracking-gnome.git
cd ai-tracking-gnome
./scripts/install.sh
```

Depois:

- **Wayland:** faça logout/login e habilite com `gnome-extensions enable
  ai-usage-monitor@prohound.io`.
- **X11:** aperte `Alt+F2`, digite `r`, `Enter` (recarrega a Shell sem
  precisar logout), depois rode o comando de habilitar acima.

Para desinstalar: `./scripts/uninstall.sh`.

## Preferências

Clique no ícone de engrenagem no rodapé do popup pra abrir as
preferências — dá pra ocultar qualquer uma das IAs do indicador e do
popup individualmente.

## Privacidade e segurança

- Código 100% aberto — audite à vontade.
- Nenhuma telemetria, nenhum servidor próprio: a extensão só fala
  diretamente com as APIs oficiais dos provedores (Anthropic, OpenAI).
- Nenhuma credencial é armazenada, logada ou enviada a terceiros — o
  token do Claude Code, por exemplo, é lido em memória só para montar uma
  requisição, nunca gravado em outro lugar.
- Nada de scraping de páginas web nem captura de cookies de sessão do
  navegador — só reaproveita o login que os próprios CLIs oficiais já
  fazem.

## Feedback

Este projeto está sendo testado internamente. Encontrou um bug, uma IA
que você gostaria de ver suportada, ou tem sugestão de UI? Abra uma
[issue](https://github.com/tiagomeconi/ai-tracking-gnome/issues).

## Para desenvolvedores

Estrutura do projeto, decisões de arquitetura (ADRs), pesquisa de cada
provider e como rodar os testes estão em
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md).

## Créditos

A técnica de reaproveitar o login OAuth dos CLIs oficiais (Claude
Code/Codex) para consultar a cota real foi verificada a partir do projeto
open-source [tokidachi](https://github.com/Gaalbu/tokidachi) (MIT),
de Gabriel Albuquerque.

## Licença

[MIT](./LICENSE)
