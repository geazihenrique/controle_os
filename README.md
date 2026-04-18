# Controle Geral | Arcode

Aplicação web estática para leitura operacional de OS futuras da Arcode a partir de uma planilha pública do Google Sheets. O foco é oferecer uma visão executiva e operacional com calendário mensal, lista cronológica de jobs e painel de detalhes, sem formulários de entrada e sem backend.

Atualização de publicação para acionar o deploy do GitHub Pages.

## Estrutura de arquivos

```text
Proj_arcode/
  index.html
  styles.css
  app.js
  data.js
  utils.js
  assets/
    logo-full.png
    icon-a.png
  README.md
```

## Como os dados são carregados

A aplicação consome diretamente o CSV público do Google Sheets, sem autenticação privada:

- Planilha: `1ul3w4dGk218jWlteoto9fFROzZT9r05NE3Fcy2fG77Q`
- Aba: `VENDAS OS`
- `gid`: `241851784`
- URL usada em runtime:
  - `https://docs.google.com/spreadsheets/d/1ul3w4dGk218jWlteoto9fFROzZT9r05NE3Fcy2fG77Q/export?format=csv&gid=241851784`

Fluxo de dados:

1. `data.js` faz o `fetch` do CSV público.
2. `utils.js` faz o parsing robusto do CSV, incluindo células com vírgulas e quebras de linha.
3. `data.js` normaliza as linhas, trata datas inválidas, filtra apenas OS com data efetiva em 2026 ou depois e detecta conflitos de instaladores.
4. `app.js` renderiza o calendário, filtros, cards da lista e painel de detalhes.

## Regras de negócio implementadas

- Exibe somente jobs com data efetiva em `2026+`.
- Data principal do job:
  - prioridade 1: `DATA DE ENTREGA` (coluna D)
  - fallback: `DATA APROV` (coluna C)
- Quando o fallback é usado, a interface mostra o badge `A definir`.
- Conflitos de instaladores são calculados apenas quando existe data real de entrega na coluna D.
- O campo de instaladores vem da coluna L (`COLABORADORES`).
- Os nomes da coluna L são separados por vírgula, com comparação case-insensitive e accent-insensitive.
- O detalhe exibe painel de alerta quando um instalador aparece em mais de uma OS na mesma data real de entrega.

## Como substituir os assets da marca

Os arquivos atuais estão em:

- `assets/logo-full.png`
- `assets/icon-a.png`

Para trocar pelos arquivos finais da marca, basta substituir esses dois arquivos mantendo exatamente os mesmos nomes.

## Como rodar localmente

Como o projeto é 100% estático, você pode abrir o `index.html` diretamente no navegador. Ainda assim, para evitar limitações de alguns navegadores com módulos ES, o ideal é servir os arquivos por um servidor estático simples.

Exemplos:

### Python

```bash
cd Proj_arcode
python3 -m http.server 8080
```

Acesse: `http://localhost:8080`

### VS Code Live Server

Abra a pasta `Proj_arcode` e inicie o Live Server.

## Deploy no GitHub Pages

1. Suba a pasta `Proj_arcode` para um repositório GitHub.
2. Se a pasta for a raiz do repositório, publique a branch principal pelo GitHub Pages.
3. Se `Proj_arcode` estiver dentro de um repositório maior, publique o conteúdo dessa pasta como a raiz do site.
4. No GitHub, vá em `Settings > Pages`.
5. Escolha a branch desejada e a pasta correta.
6. Salve e aguarde a URL pública ser gerada.

## Deploy em qualquer hospedagem estática

Funciona em qualquer serviço que publique HTML/CSS/JS estático, por exemplo:

- GitHub Pages
- Netlify
- Vercel em modo estático
- Cloudflare Pages
- Amazon S3 static website hosting

Passos gerais:

1. Envie todos os arquivos da pasta `Proj_arcode`.
2. Garanta que `index.html` esteja na raiz publicada.
3. Não é necessário build, backend ou variáveis privadas.

## Observações de manutenção

- Toda a lógica de leitura da planilha está centralizada em `data.js`.
- As funções utilitárias de data, texto e CSV ficam em `utils.js`.
- O CSS foi separado em um único arquivo para facilitar manutenção em hospedagens estáticas simples.
- Caso a planilha mude de estrutura, ajuste apenas os índices de coluna em `data.js`.
