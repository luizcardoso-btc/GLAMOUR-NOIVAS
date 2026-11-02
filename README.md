# Glamour Noivas: site, agendamento e assistente virtual

Site da Glamour Noivas (Rio Branco – AC) com:
- Catálogo com filtros e favoritos
- Agendamento online 24h com controle de vagas por horário
- Assistente virtual "Gabi", gratuita, que responde dúvidas e agenda pela conversa
- Consulta, cancelamento e "salvar na agenda do celular" pela própria cliente
- Painel da loja em `/admin`: agenda, lembretes de amanhã, contratos fechados, taxa de fechamento, catálogo, folgas e perguntas que a assistente não soube responder. Pode ser instalado no celular como aplicativo.

## Telas

| Site | Assistente / Cliente | Painel |
|---|---|---|
| ![](prints/01-inicio.png) | ![](prints/07-assistente.png) | ![](prints/11-painel-agenda.png) |
| ![](prints/03-catalogo.png) | ![](prints/06-meu-agendamento.png) | ![](prints/12-painel-gabi.png) |
| ![](prints/05-agendamento.png) | ![](prints/08-celular.png) | ![](prints/15-painel-celular.png) |

Não depende de nenhuma biblioteca externa. Só precisa do **Node.js 18 ou mais novo**.

## Rodar no computador

```bash
node server.js
```

Abra http://localhost:3000. O painel fica em http://localhost:3000/admin (senha padrão `glamour2026`).

## ⚠️ Antes de publicar: troque estes dados

| Onde | O quê |
|---|---|
| `data/config.json` → `loja` | **WhatsApp** (formato `5568999999999`), endereço, link do Maps, horário |
| `data/config.json` → `agenda` | horários de funcionamento, duração de cada atendimento, quantas clientes atende ao mesmo tempo, feriados |
| `data/config.json` → `depoimentos` | depoimentos reais (copie do Instagram/Google) |
| `data/config.json` → `faq` | respostas da assistente (as `chaves` são as palavras que ativam cada resposta) |
| Painel → Catálogo | peças reais. Coloque as fotos em `public/img/` e preencha `img/nome-da-foto.jpg` |
| `public/img/hero.svg` | troque por uma foto real de noiva (ex.: `hero.jpg`) e ajuste em `public/css/style.css` |
| Variável `ADMIN_PASSWORD` | **senha forte do painel** |

## Publicar na internet

O sistema grava os agendamentos em arquivos dentro da pasta `data/`, então precisa de **hospedagem com disco permanente**:

- **VPS** (Hostinger, Contabo, DigitalOcean, Oracle Cloud *Always Free*): `ADMIN_PASSWORD=suaSenha PORT=80 node server.js`, de preferência com `pm2` e HTTPS (Caddy ou Nginx).
- **Railway / Render / Fly.io** com *volume persistente* montado em `data/`.
- Planos gratuitos **sem disco persistente apagam os agendamentos** a cada reinício. Evite.

Domínio `.com.br`: registro.br (cerca de R$ 40/ano).

## Estrutura

```
server.js            servidor e API
data/config.json     dados da loja, agenda, FAQ da assistente
data/catalogo.json   peças do catálogo
data/agendamentos.json
public/index.html    site
public/admin.html    painel
public/js/chat.js    assistente virtual
public/js/app.js     catálogo e agendamento
```

Veja **PLANO-ESTRATEGICO.md** (plano de crescimento) e **docs/KIT-EXECUCAO.md** (bio, WhatsApp, Google e calendário de posts prontos).
