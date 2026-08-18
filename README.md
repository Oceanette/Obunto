# Obunto

Protótipo de app de comunicação (login, chat, chamadas de voz, vídeo e compartilhamento de tela), no visual techno-brutalista/suíço inspirado nas referências enviadas.

## Rodando localmente

```bash
npm install
npm start
```

Depois acesse `http://localhost:3000`.

Para testar entre duas pessoas, abra o endereço em dois navegadores diferentes (ou um navegador normal + uma aba anônima) — cada conta precisa de login próprio.

## Contas e login único

- Toda conta é criada no servidor (`/api/register`) com login e senha. O nome de usuário é único no sistema (checagem sem diferenciar maiúsculas/minúsculas).
- As senhas são armazenadas com hash + salt (`scrypt`, nativo do Node), nunca em texto puro.
- A cor de perfil escolhida no registro agora é enviada e salva corretamente pelo servidor.
- O login (`/api/login`) devolve um token de sessão; esse token é salvo no `localStorage` do navegador e reenviado em toda ação (entrar em sala de texto/voz, restaurar sessão ao reabrir a aba).
- A identidade de cada mensagem de chat e de cada participante de chamada é definida pelo servidor a partir do token.
- Existe um botão de logout (ícone ⏻ na barra de perfil) que encerra a sessão local e no servidor.
- Contas ficam salvas em `data/users.json`, criado automaticamente na primeira execução.

## Chamadas de voz e vídeo

- **Nome dos participantes**: as salas de voz agora mostram o nome real de cada pessoa (vindo do perfil autenticado), em vez de um identificador genérico — corrige o problema de duas pessoas não verem o nome uma da outra.
- **Áudio não cai mais ao compartilhar tela**: cada participante remoto tem um único stream combinado (áudio + vídeo). Antes, iniciar o compartilhamento de tela substituía inteiramente o stream exibido e o áudio do microfone deixava de tocar mesmo continuando a ser enviado — corrigido.
- **Compartilhamento de tela agora chega para todo mundo**: a negociação WebRTC foi reescrita com o padrão "perfect negotiation", permitindo que qualquer lado da chamada adicione uma nova faixa (câmera/tela) a qualquer momento. Antes, isso só funcionava para quem tinha iniciado a conexão P2P.
- **Áudio da tela/aba compartilhada**: ao compartilhar tela, o navegador agora também é solicitado a capturar o áudio da aba/sistema (quando suportado), além do vídeo.
- **Volume e mudo por pessoa**: cada quadro de vídeo remoto tem um controle de volume e um botão de "silenciar apenas para mim" — ajuste local, não afeta os outros participantes.
- **Expandir/tela cheia**: cada quadro (local ou remoto) tem um botão de expandir/tela cheia.
- **Reconexão durante a chamada**: se a conexão websocket cair e se reconectar durante uma chamada, o app agora reingressa na sala automaticamente e reconstrói a malha de conexões, em vez de deixar a chamada travada em silêncio.
- O microfone é capturado com cancelamento de eco, supressão de ruído e controle automático de ganho sempre ativos, além de taxa de amostragem de 48kHz.
- O dispositivo de entrada/saída escolhido no modal de configurações é aplicado tanto na pré-visualização quanto durante uma chamada em andamento.
- As chamadas de voz negociam Opus com bitrate mais alto (até 64kbps) e forçam FEC embutido.

## Chat em tempo real

- **Nome do remetente**: corrigido um erro em que o campo lido pelo cliente (`profile.name`) nunca existia — o servidor sempre enviou `profile.username`. Agora o nome de quem escreveu aparece corretamente em cada mensagem.
- **Histórico persistente**: o servidor agora guarda o histórico de mensagens de cada canal em `data/messages.json` e o reenvia ao entrar na sala — o histórico não desaparece mais ao trocar de canal, recarregar a página ou reconectar.
- **Indicador de "digitando..."**.
- A conexão de sinalização (WebSocket) trata erros e timeouts, reconecta automaticamente com backoff progressivo e reingressa no canal atual assim que a conexão volta — inclusive substituindo, no servidor, uma conexão antiga da mesma conta que tivesse ficado "fantasma" (o que também podia causar perda silenciosa de áudio/mensagens).
- A barra do canal mostra o status do sinal (SINAL ATIVO / CONECTANDO / SEM SINAL).
- O servidor faz *heartbeat* (ping/pong) nas conexões WebSocket para detectar e limpar clientes travados.

## Estrutura

```
server.js               servidor HTTP estático + API de contas + WebSocket de signaling + histórico de chat
data/
  users.json             contas registradas (gerado automaticamente)
  messages.json           histórico de mensagens por sala (gerado automaticamente)
public/
  index.html
  css/
    tokens.css           paleta e tipografia (tema escuro techno-brutalista)
    base.css             reset + fundo decorativo (grid, anéis, ruído, marcações técnicas)
    layout.css           grade do app (rail / canais / main)
    components.css       login/registro, perfil, botões, canais, chat
    voice.css            tiles de vídeo, controles de volume/mudo/expandir, barra de chamada
    modal.css            modal de configurações
  js/
    config.js
    dom.js
    store.js              perfil, token de sessão e preferências de áudio (localStorage)
    auth.js                chamadas para a API de contas (registro, login, sessão)
    auth-screen.js         tela de login/registro e restauração de sessão
    audio.js                constraints de captura de áudio e troca de dispositivo
    signaling.js            wrapper do WebSocket com reconexão automática
    webrtc.js               malha de PeerConnections com negociação bidirecional e streams remotos combinados
    miccheck.js             auto-escuta + medidor de nível
    modal.js                configurações de áudio (dispositivos, aplicados ao vivo)
    servers.js              dados de servidores/canais (mock)
    chat.js                 chat com histórico, indicador de digitação e reconexão automática
    voice.js                entrar/sair de canal de voz, mudo, câmera, tela, controles por participante
    main.js
```

## Design

Identidade visual reconstruída em linha com Swiss/International Typographic Style, brutalismo gráfico, tipografia técnica (Space Mono + Archivo Black), grid exposto como elemento estético, textura de ruído sutil, paleta escura quase monocromática com vermelho como cor de alerta/destaque estratégico (~10%), e rótulos técnicos (índices tipo `00.SIG`, `U01`, numeração de canais) espalhados pela interface — reforçando a sensação de "documento técnico de um sistema" em vez de "arte de um app comum".

## Limitações conhecidas

- Usa apenas STUN público (`stun.l.google.com`). Em redes com NAT mais restritivo, seria necessário um servidor TURN para garantir conexão.
- Câmera e compartilhamento de tela são mutuamente exclusivos no protótipo atual (ativar um desliga o outro).
- Captura de áudio da tela compartilhada depende do suporte do navegador/SO (nem todo navegador oferece a opção "compartilhar áudio" ao escolher a janela/aba).
- Lista de servidores/canais é mock (`public/js/servers.js`) — é o ponto de extensão para futuras funções (criar servidor, convites, permissões, etc).
- Sessões de login ficam apenas em memória no servidor; reiniciar o processo do servidor derruba todos os tokens ativos (as contas em si continuam salvas em `data/users.json`).
