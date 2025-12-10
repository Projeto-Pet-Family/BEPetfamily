// config/socket_config.js
const socketIo = require('socket.io')

const configurarSocket = (server) => {
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
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    allowEIO3: true,
    connectTimeout: 45000
  })

  // Middleware para autenticação
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token
      const tipo = socket.handshake.auth.tipo
      const id = socket.handshake.auth.id

      // Para desenvolvimento, permitir sem auth completa
      if (process.env.NODE_ENV === 'development') {
        if (!tipo || !id) {
          console.warn('⚠️ Conexão sem auth completa em desenvolvimento')
        }
      }

      // Adicionar informações ao socket
      socket.userData = {
        tipo: tipo || 'desconhecido',
        id: id ? parseInt(id) : 0,
        token: token,
        conectadoEm: new Date(),
        userAgent: socket.handshake.headers['user-agent'],
        ip: socket.handshake.address
      }

      console.log(`🔐 Cliente conectado: ${socket.userData.tipo} ${socket.userData.id}`)
      next()
      
    } catch (error) {
      console.error('❌ Erro no middleware de auth:', error)
      next(new Error('Erro de autenticação'))
    }
  })

  return io
}

module.exports = configurarSocket