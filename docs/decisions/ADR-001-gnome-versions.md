# ADR-001 — Versões GNOME suportadas

## Status

Aceito (parcial — ver pendência abaixo).

## Contexto

O plano de execução exige confirmar a versão mínima de GNOME Shell suportada
antes de iniciar a implementação, pois isso determina o sistema de módulos
usado pela extensão:

- **GNOME 45+**: sistema de extensões reescrito, usa ES Modules (`import`/
  `export`), classe `Extension` importada de
  `resource:///org/gnome/shell/extensions/extension.js`.
- **GNOME 42–44**: sistema legado, baseado em `imports.misc.extensionUtils`,
  sem `import`/`export` nativos, funções globais `init()`/`enable()`/
  `disable()`.

O usuário solicitou suporte a GNOME 42–44 e 45+.

## Decisão

1. O código compartilhado de domínio (`extension/lib/**`) é escrito em JS
   puro, sem sintaxe ESM (`import`/`export`), usando apenas `var`/funções e
   `module.exports`-like via objeto global exportado, para permitir reuso
   futuro por ambos os sistemas de módulo. Nesta primeira entrega, os
   arquivos usam ESM (`import`/`export`) por padrão, pois o esqueleto inicial
   (Fase 1) mira **GNOME 45+**.
2. **Pendência registrada explicitamente**: o suporte a GNOME 42–44 exige um
   segundo ponto de entrada (`extension.js`/`prefs.js` no estilo legado,
   possivelmente em pasta separada ou branch dedicada) que consome a mesma
   lógica de domínio. Essa camada de compatibilidade **não foi criada nesta
   entrega** porque exigiria duplicar/adaptar toda a camada de UI sem
   possibilidade de teste em runtime neste ambiente (sandbox sem GNOME
   Shell instalado).
3. Este ADR deve ser revisitado antes da Fase 9 (Hardening) para decidir:
   manter só GNOME 45+, ou implementar o fork de compatibilidade legada.

## Consequências

- `metadata.json` declara inicialmente apenas `"shell-version": ["45", "46",
  "47", "48"]`.
- O backlog (seção 16 do plano) ganha um item explícito: "Avaliar e
  implementar (ou descartar formalmente) suporte a GNOME 42–44".
- Nenhum critério de aceite de lifecycle (enable/disable) foi validado em
  runtime real; isso é responsabilidade do usuário/CI com GNOME Shell
  disponível.
