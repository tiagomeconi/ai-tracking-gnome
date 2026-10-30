# Landing page

Site estático (HTML + CSS + JS, sem build) do AI Usage Monitor.

- **Bibliotecas** (via CDN, opcionais): GSAP + ScrollTrigger, Lenis, vanilla-tilt. Se falharem, a página continua legível.
- **Idiomas:** PT-BR (padrão) e EN — textos em inglês em `i18n.js`, o português é o próprio HTML.
- **Temas:** claro/escuro (segue o sistema; escolha salva).
- **Imagens:** `assets/shots/` vêm de `docs/screenshots/` (geradas por `cd desktop && npm run screenshots`).

Ver localmente: `python3 -m http.server -d site 8080` e abrir http://localhost:8080.

**Publicar:** o workflow `.github/workflows/pages.yml` publica esta pasta no GitHub Pages
(Settings → Pages → Source: *GitHub Actions*). Também funciona em Vercel/Netlify apontando para `site/`.
