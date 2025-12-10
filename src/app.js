require('dotenv').config()

const express = require('express')
const app = express()
const port = process.env.PORT
const cors = require('cors')
const http = require('http') // Adicionar este
const socketIo = require('socket.io')

/*  */

const UsuarioRoute = require('./routes/usuario/UsuarioRoute.js')
const AutenticationRoute = require('./routes/usuario/AutenticationRoute.js')

const ContratoRoute = require('./routes/contrato/ContratoRoute.js')
const ContratoServicoRoute = require('./routes/contrato/ContratoServicoRoute.js')
const ContratoPetRoute = require('./routes/contrato/ContratoPetRoute.js')
const AvaliacaoRoute = require('./routes/contrato/AvaliacaoRoute.js') 
const DenunciaRoute = require('./routes/contrato/DenunciaRoute.js')

const HospedagemRoute = require('./routes/hospedagem/HospedagemRoute.js')
const ServicoRoute = require('./routes/hospedagem/ServicoRoute.js')

const MensagensRoute = require('./routes/mensagens/MensagensRoute.js')

const EstadoRoute = require('./routes/hospedagem/endereco/EstadoRoute.js')
const CidadeRoute = require('./routes/hospedagem/endereco/CidadeRoute.js')
const BairroRoute = require('./routes/hospedagem/endereco/BairroRoute.js')
const LogradouroRoute = require('./routes/hospedagem/endereco/LogradouroRoute.js')
const CepRoute = require('./routes/hospedagem/endereco/CepRoute.js')
const EnderecoRoute = require('./routes/hospedagem/endereco/EnderecoRoute.js')

const PetRoute = require('./routes/pet/PetRoute.js')
const PorteRoute = require('./routes/pet/PorteRoute.js')
const EspecieRoute = require('./routes/pet/EspecieRoute.js')
const RacaRoute = require('./routes/pet/RacaRoute.js')

/*  */

app.use(express.json())

// Configurar CORS para produção e desenvolvimento
const corsOptions = {
  origin: function (origin, callback) {
    // Lista de origens permitidas
    const allowedOrigins = [
  '*'
];
    
    // Permitir requisições sem origin (como mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`🚫 Origem bloqueada por CORS: ${origin}`);
      callback(new Error('Não permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}

app.use(cors(corsOptions))

// Preflight requests
app.options('*', cors(corsOptions))

/* Middleware para headers de segurança */
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
})

/* Rotas */
app.use(
  UsuarioRoute, 
  AutenticationRoute,
  ContratoRoute,
  ContratoServicoRoute,
  ContratoPetRoute,
  AvaliacaoRoute,
  DenunciaRoute,
  HospedagemRoute,
  ServicoRoute,
  MensagensRoute,
  EstadoRoute,
  CidadeRoute,
  BairroRoute,
  LogradouroRoute,
  CepRoute,
  EnderecoRoute,
  PetRoute,
  PorteRoute,
  EspecieRoute,
  RacaRoute,
)

/* Rota de saúde */
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    urls: {
      api: 'https://bepetfamily.onrender.com',
      frontend: 'https://pet-family-front.vercel.app'
    }
  })
})

app.get('/', (req, res) => {
  res.json({
    message: '🚀 PetFamily API Online',
    version: '1.0.0',
    endpoints: {
      mensagens: '/mensagem',
      usuarios: '/usuario',
      hospedagens: '/hospedagem',
      contratos: '/contrato',
      pets: '/pet'
    },
    socket: 'wss://bepetfamily.onrender.com'
  })
})

/* Criar servidor HTTP para Socket.IO */
const server = http.createServer(app)

/* Configurar Socket.IO */
const io = socketIo(server, {
  cors: {
    origin: [
      'https://pet-family-front.vercel.app',
      'https://bepetfamily.onrender.com',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:3001'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
})

/* Inicializar Socket Service */
const SocketService = require('./services/socket_service')
const socketService = new SocketService(io)
socketService.inicializar()

/* Inicializar Mensagens Controller com Socket.IO */
const MensagensController = require('./controllers/mensagens/MensagemController')
MensagensController.inicializarSocketService(io)

/* Iniciar servidor */
server.listen(port, () => {
  console.log(`🚀 Servidor HTTP rodando em http://localhost:${port}`)
  console.log(`🔌 Socket.IO ativo em ws://localhost:${port}`)
  console.log(`🌐 URLs de produção:`)
  console.log(`   API: https://bepetfamily.onrender.com`)
  console.log(`   Frontend: https://pet-family-front.vercel.app`)
})