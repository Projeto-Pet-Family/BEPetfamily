// controllers/mensagens/MensagemController.js
const pool = require('../../connections/SQLConnections.js')
let socketService = null

// Inicializar socket service quando necessário
function inicializarSocketService(io) {
  if (!socketService && io) {
    const SocketService = require('../../services/socket_service.js')
    socketService = new SocketService(io)
    socketService.inicializar()
  }
}

function isValidId(id) {
  return !isNaN(id) && parseInt(id) > 0
}

// ==================== MÉTODOS MOBILE ====================
async function enviarMensagemMobile(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idusuario, idhospedagem, mensagem } = req.body

    // Validações
    if (!idusuario || !idhospedagem || !mensagem) {
      return res.status(400).json({
        success: false,
        message: 'idusuario, idhospedagem e mensagem são obrigatórios'
      })
    }

    if (!isValidId(idusuario) || !isValidId(idhospedagem)) {
      return res.status(400).json({
        success: false,
        message: 'IDs inválidos'
      })
    }

    if (mensagem.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A mensagem não pode estar vazia'
      })
    }

    // Salvar no banco
    const result = await client.query(
      `INSERT INTO mensagens 
       (id_remetente, id_destinatario, mensagem, lida, data_envio)
       VALUES ($1, $2, $3, $4, NOW()) 
       RETURNING *`,
      [idusuario, idhospedagem, mensagem.trim(), false]
    )

    // Buscar nomes
    const usuario = await client.query(
      'SELECT nome FROM usuario WHERE idusuario = $1',
      [idusuario]
    )

    const hospedagem = await client.query(
      'SELECT nome FROM hospedagem WHERE idhospedagem = $1',
      [idhospedagem]
    )

    const mensagemSalva = {
      ...result.rows[0],
      nome_remetente: usuario.rows[0]?.nome || 'Usuário',
      nome_destinatario: hospedagem.rows[0]?.nome || 'Hospedagem',
      nome_hospedagem: hospedagem.rows[0]?.nome || 'Hospedagem',
      tipo_remetente: 'usuario'
    }

    // Enviar via Socket.IO se disponível
    if (socketService) {
      try {
        const salaConversa = `conversa_${idhospedagem}_${idusuario}`
        socketService.io.to(salaConversa).emit('nova-mensagem', mensagemSalva)
        
        socketService.enviarParaHospedagem(idhospedagem, 'notificacao-nova-mensagem', {
          mensagem: mensagem,
          remetente: 'Usuário',
          conversa: `${idhospedagem}_${idusuario}`,
          timestamp: new Date().toISOString(),
          naoLida: true
        })
        
        console.log(`📨 Mensagem enviada via socket para hospedagem ${idhospedagem}`)
      } catch (socketError) {
        console.warn('Erro ao enviar via Socket.IO (continuando com REST):', socketError)
      }
    }

    res.status(201).json({
      success: true,
      message: 'Mensagem enviada com sucesso!',
      data: mensagemSalva,
      socket: socketService ? socketService.estaHospedagemOnline(idhospedagem) : false
    })

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem mobile:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao enviar mensagem',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

async function buscarConversaMobile(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idusuario, idhospedagem } = req.params
    const { limit = 100, offset = 0 } = req.query

    if (!idusuario || !idhospedagem) {
      return res.status(400).json({
        success: false,
        message: 'idusuario e idhospedagem são obrigatórios'
      })
    }

    if (!isValidId(idusuario) || !isValidId(idhospedagem)) {
      return res.status(400).json({
        success: false,
        message: 'IDs inválidos'
      })
    }

    // Verificar status online via Socket.IO
    const hospedagemOnline = socketService ? socketService.estaHospedagemOnline(parseInt(idhospedagem)) : false
    const usuarioOnline = socketService ? socketService.estaUsuarioOnline(parseInt(idusuario)) : false

    const query = `
      SELECT 
        m.idmensagem,
        m.id_remetente,
        m.id_destinatario,
        m.mensagem,
        m.data_envio,
        m.lida,
        m.data_leitura,
        CASE 
          WHEN m.id_remetente = $1 THEN u.nome
          ELSE h.nome 
        END as nome_remetente,
        CASE 
          WHEN m.id_destinatario = $2 THEN h2.nome
          ELSE u2.nome 
        END as nome_destinatario,
        h.nome as nome_hospedagem
      FROM mensagens m
      LEFT JOIN usuario u ON m.id_remetente = u.idusuario
      LEFT JOIN usuario u2 ON m.id_destinatario = u2.idusuario
      LEFT JOIN hospedagem h ON m.id_remetente = h.idhospedagem
      LEFT JOIN hospedagem h2 ON m.id_destinatario = h2.idhospedagem
      WHERE (m.id_remetente = $1 AND m.id_destinatario = $2)
         OR (m.id_remetente = $2 AND m.id_destinatario = $1)
      ORDER BY m.data_envio ASC
      LIMIT $3 OFFSET $4
    `

    const result = await client.query(query, [idusuario, idhospedagem, limit, offset])
    
    // Contar mensagens não lidas
    const naoLidasResult = await client.query(
      'SELECT COUNT(*) as total FROM mensagens WHERE id_destinatario = $1 AND id_remetente = $2 AND lida = false',
      [idusuario, idhospedagem]
    )

    res.status(200).json({
      success: true,
      conversa: result.rows,
      participantes: {
        idusuario: parseInt(idusuario),
        idhospedagem: parseInt(idhospedagem),
        nome_hospedagem: result.rows[0]?.nome_hospedagem || 'Hospedagem',
        status: {
          usuarioOnline,
          hospedagemOnline,
          ambosOnline: usuarioOnline && hospedagemOnline
        }
      },
      estatisticas: {
        total: result.rows.length,
        naoLidas: parseInt(naoLidasResult.rows[0].total),
        primeiraMensagem: result.rows[0]?.data_envio || null,
        ultimaMensagem: result.rows[result.rows.length - 1]?.data_envio || null
      },
      paginacao: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    })

  } catch (error) {
    console.error('❌ Erro ao buscar conversa mobile:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar conversa',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

async function listarConversasMobile(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idusuario } = req.params
    const { limit = 20, offset = 0 } = req.query

    if (!idusuario) {
      return res.status(400).json({
        success: false,
        message: 'ID do usuário é obrigatório'
      })
    }

    if (!isValidId(idusuario)) {
      return res.status(400).json({
        success: false,
        message: 'ID do usuário inválido'
      })
    }

    // Verificar se o usuário está online via Socket.IO
    const usuarioOnline = socketService ? socketService.estaUsuarioOnline(parseInt(idusuario)) : false

    const query = `
      SELECT DISTINCT ON (h.idhospedagem)
        h.idhospedagem as idcontato,
        h.nome as nome_contato,
        'hospedagem' as tipo_contato,
        m.mensagem as ultima_mensagem,
        m.data_envio as ultima_data,
        m.lida,
        (SELECT COUNT(*) 
         FROM mensagens 
         WHERE id_destinatario = $1 
         AND id_remetente = h.idhospedagem
         AND lida = false) as nao_lidas,
        (SELECT COUNT(*)
         FROM mensagens
         WHERE (id_remetente = $1 AND id_destinatario = h.idhospedagem)
            OR (id_remetente = h.idhospedagem AND id_destinatario = $1)) as total_mensagens
      FROM mensagens m
      INNER JOIN hospedagem h ON (
        (m.id_remetente = $1 AND m.id_destinatario = h.idhospedagem) 
        OR (m.id_remetente = h.idhospedagem AND m.id_destinatario = $1)
      )
      WHERE h.idhospedagem IS NOT NULL
      ORDER BY h.idhospedagem, m.data_envio DESC
      LIMIT $2 OFFSET $3
    `

    const result = await client.query(query, [idusuario, limit, offset])
    
    // Adicionar status online das hospedagens
    const conversasComStatus = result.rows.map(conversa => ({
      ...conversa,
      online: socketService ? socketService.estaHospedagemOnline(conversa.idcontato) : false
    }))

    res.status(200).json({
      success: true,
      conversas: conversasComStatus,
      usuario: {
        id: parseInt(idusuario),
        online: usuarioOnline
      },
      paginacao: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    })

  } catch (error) {
    console.error('❌ Erro ao listar conversas mobile:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao listar conversas',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

// ==================== MÉTODOS WEB ====================
async function enviarMensagemWeb(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idhospedagem, idusuario, mensagem } = req.body

    // Validações
    if (!idhospedagem || !idusuario || !mensagem) {
      return res.status(400).json({
        success: false,
        message: 'idhospedagem, idusuario e mensagem são obrigatórios'
      })
    }

    if (!isValidId(idhospedagem) || !isValidId(idusuario)) {
      return res.status(400).json({
        success: false,
        message: 'IDs inválidos'
      })
    }

    if (mensagem.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A mensagem não pode estar vazia'
      })
    }

    // Salvar no banco
    const result = await client.query(
      `INSERT INTO mensagens 
       (id_remetente, id_destinatario, mensagem, lida, data_envio)
       VALUES ($1, $2, $3, $4, NOW()) 
       RETURNING *`,
      [idhospedagem, idusuario, mensagem.trim(), false]
    )

    // Buscar nomes
    const hospedagem = await client.query(
      'SELECT nome FROM hospedagem WHERE idhospedagem = $1',
      [idhospedagem]
    )

    const usuario = await client.query(
      'SELECT nome FROM usuario WHERE idusuario = $1',
      [idusuario]
    )

    const mensagemSalva = {
      ...result.rows[0],
      nome_remetente: hospedagem.rows[0]?.nome || 'Hospedagem',
      nome_destinatario: usuario.rows[0]?.nome || 'Usuário',
      nome_hospedagem: hospedagem.rows[0]?.nome || 'Hospedagem',
      tipo_remetente: 'hospedagem'
    }

    // Enviar via Socket.IO se disponível
    if (socketService) {
      try {
        const salaConversa = `conversa_${idhospedagem}_${idusuario}`
        socketService.io.to(salaConversa).emit('nova-mensagem', mensagemSalva)
        
        socketService.enviarParaUsuario(idusuario, 'notificacao-nova-mensagem', {
          mensagem: mensagem,
          remetente: hospedagem.rows[0]?.nome || 'Hospedagem',
          conversa: `${idhospedagem}_${idusuario}`,
          timestamp: new Date().toISOString(),
          naoLida: true
        })
        
        console.log(`📨 Mensagem enviada via socket para usuário ${idusuario}`)
      } catch (socketError) {
        console.warn('Erro ao enviar via Socket.IO (continuando com REST):', socketError)
      }
    }

    res.status(201).json({
      success: true,
      message: 'Mensagem enviada com sucesso!',
      data: mensagemSalva,
      socket: socketService ? socketService.estaUsuarioOnline(idusuario) : false
    })

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem web:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao enviar mensagem',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

async function buscarConversaWeb(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idhospedagem, idusuario } = req.params
    const { limit = 100, offset = 0 } = req.query

    if (!idhospedagem || !idusuario) {
      return res.status(400).json({
        success: false,
        message: 'idhospedagem e idusuario são obrigatórios'
      })
    }

    if (!isValidId(idhospedagem) || !isValidId(idusuario)) {
      return res.status(400).json({
        success: false,
        message: 'IDs inválidos'
      })
    }

    // Verificar status online via Socket.IO
    const hospedagemOnline = socketService ? socketService.estaHospedagemOnline(parseInt(idhospedagem)) : false
    const usuarioOnline = socketService ? socketService.estaUsuarioOnline(parseInt(idusuario)) : false

    const query = `
      SELECT 
        m.idmensagem,
        m.id_remetente,
        m.id_destinatario,
        m.mensagem,
        m.data_envio,
        m.lida,
        m.data_leitura,
        CASE 
          WHEN m.id_remetente = $1 THEN h.nome
          ELSE u.nome 
        END as nome_remetente,
        CASE 
          WHEN m.id_destinatario = $2 THEN u2.nome
          ELSE h2.nome 
        END as nome_destinatario,
        h.nome as nome_hospedagem
      FROM mensagens m
      LEFT JOIN hospedagem h ON m.id_remetente = h.idhospedagem
      LEFT JOIN hospedagem h2 ON m.id_destinatario = h2.idhospedagem
      LEFT JOIN usuario u ON m.id_remetente = u.idusuario
      LEFT JOIN usuario u2 ON m.id_destinatario = u2.idusuario
      WHERE (m.id_remetente = $1 AND m.id_destinatario = $2)
         OR (m.id_remetente = $2 AND m.id_destinatario = $1)
      ORDER BY m.data_envio ASC
      LIMIT $3 OFFSET $4
    `

    const result = await client.query(query, [idhospedagem, idusuario, limit, offset])
    
    // Contar mensagens não lidas (do ponto de vista da hospedagem)
    const naoLidasResult = await client.query(
      'SELECT COUNT(*) as total FROM mensagens WHERE id_destinatario = $1 AND id_remetente = $2 AND lida = false',
      [idhospedagem, idusuario]
    )

    // Marcar mensagens como lidas (quando a hospedagem visualiza)
    if (result.rows.length > 0) {
      await client.query(
        'UPDATE mensagens SET lida = true, data_leitura = NOW() WHERE id_destinatario = $1 AND id_remetente = $2 AND lida = false',
        [idhospedagem, idusuario]
      )
    }

    res.status(200).json({
      success: true,
      conversa: result.rows,
      participantes: {
        idhospedagem: parseInt(idhospedagem),
        idusuario: parseInt(idusuario),
        nome_usuario: result.rows.find(m => m.id_remetente === parseInt(idusuario))?.nome_remetente || 'Usuário',
        nome_hospedagem: result.rows[0]?.nome_hospedagem || 'Hospedagem',
        status: {
          usuarioOnline,
          hospedagemOnline,
          ambosOnline: usuarioOnline && hospedagemOnline
        }
      },
      estatisticas: {
        total: result.rows.length,
        naoLidas: parseInt(naoLidasResult.rows[0].total),
        primeiraMensagem: result.rows[0]?.data_envio || null,
        ultimaMensagem: result.rows[result.rows.length - 1]?.data_envio || null
      },
      paginacao: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    })

  } catch (error) {
    console.error('❌ Erro ao buscar conversa web:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar conversa',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

async function listarConversasWeb(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idhospedagem } = req.params
    const { limit = 20, offset = 0 } = req.query

    if (!idhospedagem) {
      return res.status(400).json({
        success: false,
        message: 'ID da hospedagem é obrigatório'
      })
    }

    if (!isValidId(idhospedagem)) {
      return res.status(400).json({
        success: false,
        message: 'ID da hospedagem inválido'
      })
    }

    // Verificar se a hospedagem está online via Socket.IO
    const hospedagemOnline = socketService ? socketService.estaHospedagemOnline(parseInt(idhospedagem)) : false

    const query = `
      SELECT DISTINCT ON (u.idusuario)
        u.idusuario as idcontato,
        u.nome as nome_contato,
        u.email as email_contato,
        'usuario' as tipo_contato,
        m.mensagem as ultima_mensagem,
        m.data_envio as ultima_data,
        m.lida,
        (SELECT COUNT(*) 
         FROM mensagens 
         WHERE id_destinatario = $1 
         AND id_remetente = u.idusuario
         AND lida = false) as nao_lidas,
        (SELECT COUNT(*)
         FROM mensagens
         WHERE (id_remetente = $1 AND id_destinatario = u.idusuario)
            OR (id_remetente = u.idusuario AND id_destinatario = $1)) as total_mensagens
      FROM mensagens m
      INNER JOIN usuario u ON (
        (m.id_remetente = $1 AND m.id_destinatario = u.idusuario) 
        OR (m.id_remetente = u.idusuario AND m.id_destinatario = $1)
      )
      WHERE u.idusuario IS NOT NULL
      ORDER BY u.idusuario, m.data_envio DESC
      LIMIT $2 OFFSET $3
    `

    const result = await client.query(query, [idhospedagem, limit, offset])
    
    // Adicionar status online dos usuários
    const conversasComStatus = result.rows.map(conversa => ({
      ...conversa,
      online: socketService ? socketService.estaUsuarioOnline(conversa.idcontato) : false
    }))

    res.status(200).json({
      success: true,
      conversas: conversasComStatus,
      hospedagem: {
        id: parseInt(idhospedagem),
        online: hospedagemOnline
      },
      paginacao: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    })

  } catch (error) {
    console.error('❌ Erro ao listar conversas web:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao listar conversas',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

async function marcarComoLida(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idmensagem } = req.params
    const { tipo, id } = req.body // tipo: 'usuario' ou 'hospedagem', id: id do destinatário

    if (!idmensagem || !tipo || !id) {
      return res.status(400).json({
        success: false,
        message: 'idmensagem, tipo e id são obrigatórios'
      })
    }

    let query
    if (tipo === 'usuario') {
      query = `
        UPDATE mensagens 
        SET lida = true, data_leitura = NOW() 
        WHERE idmensagem = $1 
        AND id_destinatario = $2
        RETURNING *
      `
    } else if (tipo === 'hospedagem') {
      query = `
        UPDATE mensagens 
        SET lida = true, data_leitura = NOW() 
        WHERE idmensagem = $1 
        AND id_destinatario = $2
        RETURNING *
      `
    } else {
      return res.status(400).json({
        success: false,
        message: 'Tipo inválido. Use "usuario" ou "hospedagem"'
      })
    }

    const result = await client.query(query, [idmensagem, id])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mensagem não encontrada ou não pertence ao destinatário'
      })
    }

    res.status(200).json({
      success: true,
      message: 'Mensagem marcada como lida',
      data: result.rows[0]
    })

  } catch (error) {
    console.error('❌ Erro ao marcar mensagem como lida:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar status da mensagem',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

async function buscarMensagem(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idmensagem } = req.params

    if (!idmensagem) {
      return res.status(400).json({
        success: false,
        message: 'ID da mensagem é obrigatório'
      })
    }

    const query = `
      SELECT 
        m.*,
        CASE 
          WHEN m.id_remetente = u.idusuario THEN u.nome
          ELSE h.nome 
        END as nome_remetente,
        CASE 
          WHEN m.id_destinatario = u2.idusuario THEN u2.nome
          ELSE h2.nome 
        END as nome_destinatario
      FROM mensagens m
      LEFT JOIN usuario u ON m.id_remetente = u.idusuario
      LEFT JOIN usuario u2 ON m.id_destinatario = u2.idusuario
      LEFT JOIN hospedagem h ON m.id_remetente = h.idhospedagem
      LEFT JOIN hospedagem h2 ON m.id_destinatario = h2.idhospedagem
      WHERE m.idmensagem = $1
    `

    const result = await client.query(query, [idmensagem])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mensagem não encontrada'
      })
    }

    res.status(200).json({
      success: true,
      mensagem: result.rows[0]
    })

  } catch (error) {
    console.error('❌ Erro ao buscar mensagem:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar mensagem',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

async function deletarMensagem(req, res) {
  let client
  try {
    client = await pool.connect()
    const { idmensagem } = req.params
    const { tipo, id } = req.body // tipo: 'usuario' ou 'hospedagem', id: id do remetente (para autorização)

    if (!idmensagem || !tipo || !id) {
      return res.status(400).json({
        success: false,
        message: 'idmensagem, tipo e id são obrigatórios'
      })
    }

    // Verificar se a mensagem pertence ao remetente
    const verificarQuery = 'SELECT id_remetente FROM mensagens WHERE idmensagem = $1'
    const verificarResult = await client.query(verificarQuery, [idmensagem])

    if (verificarResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mensagem não encontrada'
      })
    }

    if (verificarResult.rows[0].id_remetente !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: 'Você não tem permissão para deletar esta mensagem'
      })
    }

    // Deletar mensagem
    const deleteQuery = 'DELETE FROM mensagens WHERE idmensagem = $1 RETURNING *'
    const deleteResult = await client.query(deleteQuery, [idmensagem])

    res.status(200).json({
      success: true,
      message: 'Mensagem deletada com sucesso',
      data: deleteResult.rows[0]
    })

  } catch (error) {
    console.error('❌ Erro ao deletar mensagem:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar mensagem',
      error: error.message
    })
  } finally {
    if (client) client.release()
  }
}

module.exports = {
  inicializarSocketService,
  enviarMensagemMobile,
  buscarConversaMobile,
  listarConversasMobile,
  enviarMensagemWeb,
  buscarConversaWeb,
  listarConversasWeb,
  marcarComoLida,
  buscarMensagem,
  deletarMensagem
}