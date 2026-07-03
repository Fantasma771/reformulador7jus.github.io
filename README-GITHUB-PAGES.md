# Equipe Fantasma — versão estática (GitHub Pages)

Esta é uma versão 100% front-end (HTML/CSS/JS puro) do site original, adaptada
para rodar sem servidor, hospedável direto no GitHub Pages.

## ⚠️ Importante — leia antes de usar

- Não existe backend/banco de dados real. Login, usuários, histórico de login
  e atividades ficam salvos no `localStorage` **do navegador de cada pessoa**.
- Dados **não são compartilhados** entre diferentes visitantes/dispositivos —
  cada um vê seu próprio "banco" local.
- O código-fonte (incluindo a lógica de senha) fica público, como em qualquer
  site estático. O hash SHA-256 usado é só para não guardar a senha em texto
  puro no localStorage — não é uma proteção de segurança real.
- Use isso para demonstração ou uso pessoal, não para dados sensíveis de
  clientes de verdade.

## Usuário padrão

Na primeira visita ao site, um usuário admin é criado automaticamente:

```
usuário: admin
senha:   mudeesta123
```

Troque a senha assim que possível pelo próprio Painel Admin (criando um novo
usuário e removendo o `admin` padrão, ou simplesmente trocando via
`localStorage` no DevTools).

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `equipe-fantasma`).
2. Envie todos os arquivos desta pasta para a raiz do repositório:
   ```
   git init
   git add .
   git commit -m "Site Equipe Fantasma (versão estática)"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/equipe-fantasma.git
   git push -u origin main
   ```
3. No GitHub, vá em **Settings → Pages**.
4. Em "Source", selecione a branch `main` e a pasta `/ (root)`.
5. Salve. Em alguns minutos o site estará em:
   `https://SEU_USUARIO.github.io/equipe-fantasma/`

## Estrutura dos arquivos

- `index.html` — redireciona para `login.html` ou `app.html` conforme a sessão.
- `login.html` — tela de login (client-side).
- `app.html` — a ferramenta (reformulador de processos), igual à original.
- `admin.html` — painel admin (estatísticas, usuários, histórico) via localStorage.
- `storage.js` — "banco de dados" simulado em localStorage (usuários, sessões,
  logins, atividades).
- `tracker.js` — controla sessão/heartbeat na página, igual à versão original
  mas usando `storage.js` em vez de chamadas de API.
- `.nojekyll` — evita que o GitHub Pages tente processar os arquivos com Jekyll.

## Testar localmente antes de publicar

Basta abrir `index.html` num servidor local simples (não funciona bem com
`file://` direto por causa de alguns recursos do navegador):

```
npx serve .
# ou
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.
