// services/socket_service.js
const pool = require('../connections/SQLConnections.js')

class SocketService {
  constructor(io) {
    this.io = io
    this.conexoesAtivas = {
      usuarios: new Map(),    // idUsuario -> { socketId, dataConexao }
      hospedagens: new Map()  // idHospedagem -> { socketId, dataConexao }
    }
  }

  inicializar() {
    this.io.on('connection', (socket) => {
      const { tipo, id } = socket.userData
      
      // Registrar conexão
      this.registrarConexao(socket, tipo, id)
      
      console.log(`🟢 Nova conexão: ${tipo} ${id} (socket: ${socket.id})`)

      // Configurar eventos
      this.configurarEventosConversa(socket)
      this.configurarEventosMensagens(socket)
      this.configurarEventosStatus(socket)

      // Desconexão
      socket.on('disconnect', () => {
        this.removerConexao(socket, tipo, id)
      })

      // Erro
      socket.on('error', (error) => {
        console.error(`❌ Erro no socket ${socket.id}:`, error)
      })
    })
  }

  configurarEventosConversa(socket) {
    // Entrar em uma conversa
    socket.on('entrar-conversa', (data) => {
      try {
        const { idHospedagem, idUsuario } = data
        
        if (!idHospedagem || !idUsuario) {
          socket.emit('erro', { message: 'idHospedagem e idUsuario são obrigatórios' })
          return
        }

        const salaConversa = `conversa_${idHospedagem}_${idUsuario}`
        socket.join(salaConversa)
        
        console.log(`💬 ${socket.userData.tipo} ${socket.userData.id} entrou na sala: ${salaConversa}`)
        
        // Confirmar entrada
        socket.emit('conversa-ativa', {
          sala: salaConversa,
          timestamp: new Date().toISOString()
        })

      } catch (error) {
        console.error('Erro ao entrar na conversa:', error)
        socket.emit('erro', { message: 'Erro ao entrar na conversa' })
      }
    })

    // Sair de uma conversa
    socket.on('sair-conversa', (data) => {
      const { idHospedagem, idUsuario } = data
      const salaConversa = `conversa_${idHospedagem}_${idUsuario}`
      socket.leave(salaConversa)
      console.log(`🚪 ${socket.id} saiu da sala: ${salaConversa}`)
    })
  }

  configurarEventosMensagens(socket) {
    // Enviar mensagem em tempo real
    socket.on('enviar-mensagem-tempo-real', async (data) => {
      try {
        const { idHospedagem, idUsuario, mensagem, tipoRemetente } = data
        
        console.log('📤 Mensagem recebida via socket:', {
          de: `${tipoRemetente} ${socket.userData.id}`,
          para: `${idHospedagem}_${idUsuario}`,
          mensagem: mensagem.substring(0, 50) + (mensagem.length > 50 ? '...' : '')
        })

        // Validar dados
        if (!idHospedagem || !idUsuario || !mensagem || !tipoRemetente) {
          socket.emit('erro-mensagem', { error: 'Dados incompletos' })
          return
        }

        // Salvar no banco de dados
        const mensagemSalva = await this.salvarMensagemNoBanco(
          idHospedagem,
          idUsuario,
          mensagem,
          tipoRemetente
        )

        if (!mensagemSalva) {
          socket.emit('erro-mensagem', { error: 'Erro ao salvar mensagem' })
          return
        }

        // Preparar mensagem para broadcast
        const mensagemCompleta = {
          ...mensagemSalva,
          tipo_remetente: tipoRemetente,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        }

        // Enviar para sala da conversa
        const salaConversa = `conversa_${idHospedagem}_${idUsuario}`
        this.io.to(salaConversa).emit('nova-mensagem', mensagemCompleta)
        
        console.log(`📨 Mensagem enviada para sala: ${salaConversa}`)

        // Notificar destinatário específico
        this.notificarDestinatario(idHospedagem, idUsuario, tipoRemetente, mensagem)

        // Confirmar envio ao remetente
        socket.emit('mensagem-enviada', {
          id: mensagemSalva.idmensagem,
          status: 'entregue',
          timestamp: new Date().toISOString()
        })

      } catch (error) {
        console.error('❌ Erro ao processar mensagem em tempo real:', error)
        socket.emit('erro-mensagem', { 
          error: error.message,
          code: 'SOCKET_ERROR'
        })
      }
    })

    // Marcar mensagem como lida
    socket.on('marcar-mensagem-lida', async (data) => {
      try {
        const { idMensagem, idHospedagem, idUsuario } = data
        
        if (!idMensagem) {
          socket.emit('erro', { message: 'idMensagem é obrigatório' })
          return
        }

        const resultado = await this.marcarMensagemComoLida(idMensagem)
        
        if (resultado) {
          // Notificar na sala da conversa
          const salaConversa = `conversa_${idHospedagem}_${idUsuario}`
          this.io.to(salaConversa).emit('mensagem-lida', { 
            idMensagem,
            lidaEm: new Date().toISOString(),
            lidaPor: socket.userData.id
          })
          
          console.log(`👁️ Mensagem ${idMensagem} marcada como lida por ${socket.userData.tipo} ${socket.userData.id}`)
        }

      } catch (error) {
        console.error('Erro ao marcar mensagem como lida:', error)
        socket.emit('erro', { message: 'Erro ao marcar mensagem como lida' })
      }
    })
  }

  configurarEventosStatus(socket) {
    // Ping/pong para verificar conexão
    socket.on('ping', () => {
      socket.emit('pong', {
        timestamp: new Date().toISOString(),
        serverTime: Date.now()
      })
    })
  }

  // ==================== MÉTODOS AUXILIARES ====================

  registrarConexao(socket, tipo, id) {
    const conexaoInfo = {
      socketId: socket.id,
      dataConexao: new Date(),
      userData: socket.userData
    }

    if (tipo === 'usuario') {
      this.conexoesAtivas.usuarios.set(id, conexaoInfo)
    } else if (tipo === 'hospedagem') {
      this.conexoesAtivas.hospedagens.set(id, conexaoInfo)
    }

    // Notificar status de conexão
    this.notificarStatusConexao(tipo, id, true)
  }

  removerConexao(socket, tipo, id) {
    if (tipo === 'usuario') {
      this.conexoesAtivas.usuarios.delete(id)
    } else if (tipo === 'hospedagem') {
      this.conexoesAtivas.hospedagens.delete(id)
    }

    console.log(`🔴 Conexão encerrada: ${tipo} ${id} (socket: ${socket.id})`)
    
    // Notificar status de desconexão
    this.notificarStatusConexao(tipo, id, false)
  }

  notificarStatusConexao(tipo, id, conectado) {
    const evento = tipo === 'usuario' ? 'status-usuario-atualizado' : 'status-hospedagem-atualizado'
    
    this.io.emit(evento, {
      tipo,
      id,
      online: conectado,
      timestamp: new Date().toISOString()
    })
  }

  notificarDestinatario(idHospedagem, idUsuario, tipoRemetente, mensagem) {
    const eventoNotificacao = 'notificacao-nova-mensagem'
    const dadosNotificacao = {
      mensagem: mensagem.substring(0, 100) + (mensagem.length > 100 ? '...' : ''),
      remetente: tipoRemetente === 'hospedagem' ? 'Hospedagem' : 'Usuário',
      conversa: `${idHospedagem}_${idUsuario}`,
      timestamp: new Date().toISOString(),
      naoLida: true
    }

    // Enviar notificação para o destinatário específico
    if (tipoRemetente === 'hospedagem') {
      // Mensagem da hospedagem para usuário
      const conexaoUsuario = this.conexoesAtivas.usuarios.get(idUsuario)
      if (conexaoUsuario) {
        this.io.to(conexaoUsuario.socketId).emit(eventoNotificacao, dadosNotificacao)
      }
    } else {
      // Mensagem do usuário para hospedagem
      const conexaoHospedagem = this.conexoesAtivas.hospedagens.get(idHospedagem)
      if (conexaoHospedagem) {
        this.io.to(conexaoHospedagem.socketId).emit(eventoNotificacao, dadosNotificacao)
      }
    }
  }

  async salvarMensagemNoBanco(idHospedagem, idUsuario, mensagem, tipoRemetente) {
    let client
    try {
      client = await pool.connect()
      
      const idRemetente = tipoRemetente === 'hospedagem' ? idHospedagem : idUsuario
      const idDestinatario = tipoRemetente === 'hospedagem' ? idUsuario : idHospedagem
      
      const result = await client.query(
        `INSERT INTO mensagens 
         (id_remetente, id_destinatario, mensagem, lida, data_envio)
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING *`,
        [idRemetente, idDestinatario, mensagem.trim(), false]
      )

      if (result.rows.length === 0) {
        throw new Error('Falha ao inserir mensagem no banco')
      }

      // Buscar informações dos participantes
      const [usuarioResult, hospedagemResult] = await Promise.all([
        client.query('SELECT nome FROM usuario WHERE idusuario = $1', [idUsuario]),
        client.query('SELECT nome FROM hospedagem WHERE idhospedagem = $1', [idHospedagem])
      ])

      const mensagemSalva = {
        ...result.rows[0],
        nome_remetente: tipoRemetente === 'hospedagem' 
          ? hospedagemResult.rows[0]?.nome || 'Hospedagem'
          : usuarioResult.rows[0]?.nome || 'Usuário',
        nome_destinatario: tipoRemetente === 'hospedagem'
          ? usuarioResult.rows[0]?.nome || 'Usuário'
          : hospedagemResult.rows[0]?.nome || 'Hospedagem',
        nome_hospedagem: hospedagemResult.rows[0]?.nome || 'Hospedagem'
      }

      return mensagemSalva

    } catch (error) {
      console.error('Erro ao salvar mensagem no banco:', error)
      throw error
    } finally {
      if (client) client.release()
    }
  }

  async marcarMensagemComoLida(idMensagem) {
    let client
    try {
      client = await pool.connect()
      
      const result = await client.query(
        `UPDATE mensagens 
         SET lida = true, data_leitura = NOW()
         WHERE idmensagem = $1 
         RETURNING *`,
        [idMensagem]
      )

      return result.rows.length > 0

    } catch (error) {
      console.error('Erro ao marcar mensagem como lida:', error)
      throw error
    } finally {
      if (client) client.release()
    }
  }

  // Métodos para acesso externo
  getConexaoUsuario(idUsuario) {
    return this.conexoesAtivas.usuarios.get(idUsuario)
  }

  getConexaoHospedagem(idHospedagem) {
    return this.conexoesAtivas.hospedagens.get(idHospedagem)
  }

  estaUsuarioOnline(idUsuario) {
    return this.conexoesAtivas.usuarios.has(idUsuario)
  }

  estaHospedagemOnline(idHospedagem) {
    return this.conexoesAtivas.hospedagens.has(idHospedagem)
  }

  enviarParaUsuario(idUsuario, evento, dados) {
    const conexao = this.getConexaoUsuario(idUsuario)
    if (conexao && this.io) {
      this.io.to(conexao.socketId).emit(evento, dados)
      return true
    }
    return false
  }

  enviarParaHospedagem(idHospedagem, evento, dados) {
    const conexao = this.getConexaoHospedagem(idHospedagem)
    if (conexao && this.io) {
      this.io.to(conexao.socketId).emit(evento, dados)
      return true
    }
    return false
  }
}

module.exports = SocketService