const pool = require('../../connections/SQLConnections.js');

// Função auxiliar para validar IDs
function isValidId(id) {
    return !isNaN(id) && parseInt(id) > 0;
}

// ==================== MÉTODOS MOBILE ====================
// (Usuário → Hospedagem)

async function enviarMensagemMobile(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario, idhospedagem, mensagem } = req.body;

        // Validações básicas
        if (!idusuario || !idhospedagem || !mensagem) {
            return res.status(400).json({
                message: 'idusuario, idhospedagem e mensagem são obrigatórios'
            });
        }

        if (!isValidId(idusuario) || !isValidId(idhospedagem)) {
            return res.status(400).json({
                message: 'IDs inválidos'
            });
        }

        if (mensagem.trim().length === 0) {
            return res.status(400).json({
                message: 'A mensagem não pode estar vazia'
            });
        }

        // Usuário (remetente) envia para Hospedagem (destinatário)
        const result = await client.query(
            `INSERT INTO mensagens 
             (id_remetente, id_destinatario, mensagem)
             VALUES ($1, $2, $3) 
             RETURNING *`,
            [idusuario, idhospedagem, mensagem.trim()]
        );

        // Buscar nome do usuário remetente
        const usuario = await client.query(
            'SELECT nome FROM usuario WHERE idusuario = $1',
            [idusuario]
        );

        const nomeUsuario = usuario.rows[0]?.nome || 'Usuário';

        // Buscar nome da hospedagem destinatária
        const hospedagem = await client.query(
            'SELECT nome FROM hospedagem WHERE idhospedagem = $1',
            [idhospedagem]
        );

        const nomeHospedagem = hospedagem.rows[0]?.nome || 'Hospedagem';

        res.status(201).json({
            message: 'Mensagem enviada com sucesso!',
            data: {
                ...result.rows[0],
                nome_remetente: nomeUsuario,
                nome_destinatario: nomeHospedagem,
                nome_hospedagem: nomeHospedagem
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao enviar mensagem',
            error: error.message
        });
        console.error('Erro ao enviar mensagem mobile:', error);
    } finally {
        if (client) client.release();
    }
}

async function buscarConversaMobile(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario, idhospedagem } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        if (!idusuario || !idhospedagem) {
            return res.status(400).json({
                message: 'idusuario e idhospedagem são obrigatórios'
            });
        }

        if (!isValidId(idusuario) || !isValidId(idhospedagem)) {
            return res.status(400).json({
                message: 'IDs inválidos'
            });
        }

        // Buscar conversa completa entre usuário e hospedagem
        const query = `
            SELECT 
                m.idmensagem,
                m.id_remetente,
                m.id_destinatario,
                m.mensagem,
                m.data_envio,
                m.lida,
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
            WHERE (m.id_remetente = $1 AND m.id_destinatario = $2)    -- Usuário → Hospedagem
               OR (m.id_remetente = $2 AND m.id_destinatario = $1)    -- Hospedagem → Usuário
            ORDER BY m.data_envio ASC
            LIMIT $3 OFFSET $4
        `;

        const result = await client.query(query, [idusuario, idhospedagem, limit, offset]);
        
        res.status(200).json({
            conversa: result.rows,
            participantes: {
                idusuario: parseInt(idusuario),
                idhospedagem: parseInt(idhospedagem),
                nome_hospedagem: result.rows[0]?.nome_hospedagem || 'Hospedagem'
            },
            paginacao: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rows.length
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar conversa',
            error: error.message
        });
        console.error('Erro ao buscar conversa mobile:', error);
    } finally {
        if (client) client.release();
    }
}

async function listarConversasMobile(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        if (!idusuario) {
            return res.status(400).json({
                message: 'ID do usuário é obrigatório'
            });
        }

        if (!isValidId(idusuario)) {
            return res.status(400).json({
                message: 'ID do usuário inválido'
            });
        }

        // Buscar conversas do usuário com hospedagens
        const query = `
            SELECT DISTINCT ON (m.id_destinatario)
                m.id_destinatario as idcontato,
                h.nome as nome_contato,
                'hospedagem' as tipo_contato,
                m.mensagem as ultima_mensagem,
                m.data_envio as ultima_data,
                m.lida,
                (SELECT COUNT(*) 
                 FROM mensagens 
                 WHERE id_destinatario = $1 
                 AND id_remetente = m.id_destinatario
                 AND lida = false) as nao_lidas
            FROM mensagens m
            LEFT JOIN hospedagem h ON m.id_destinatario = h.idhospedagem
            WHERE m.id_remetente = $1 AND h.idhospedagem IS NOT NULL
            ORDER BY m.id_destinatario, m.data_envio DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await client.query(query, [idusuario, limit, offset]);
        
        res.status(200).json({
            conversas: result.rows,
            paginacao: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rows.length
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar conversas',
            error: error.message
        });
        console.error('Erro ao listar conversas mobile:', error);
    } finally {
        if (client) client.release();
    }
}

// ==================== MÉTODOS WEB ====================
// (Hospedagem → Usuário)

async function enviarMensagemWeb(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idhospedagem, idusuario, mensagem } = req.body;

        // Validações básicas
        if (!idhospedagem || !idusuario || !mensagem) {
            return res.status(400).json({
                message: 'idhospedagem, idusuario e mensagem são obrigatórios'
            });
        }

        if (!isValidId(idhospedagem) || !isValidId(idusuario)) {
            return res.status(400).json({
                message: 'IDs inválidos'
            });
        }

        if (mensagem.trim().length === 0) {
            return res.status(400).json({
                message: 'A mensagem não pode estar vazia'
            });
        }

        // Hospedagem (remetente) envia para Usuário (destinatário)
        const result = await client.query(
            `INSERT INTO mensagens 
             (id_remetente, id_destinatario, mensagem)
             VALUES ($1, $2, $3) 
             RETURNING *`,
            [idhospedagem, idusuario, mensagem.trim()]
        );

        // Buscar nome da hospedagem remetente
        const hospedagem = await client.query(
            'SELECT nome FROM hospedagem WHERE idhospedagem = $1',
            [idhospedagem]
        );

        const nomeHospedagem = hospedagem.rows[0]?.nome || 'Hospedagem';

        // Buscar nome do usuário destinatário
        const usuario = await client.query(
            'SELECT nome FROM usuario WHERE idusuario = $1',
            [idusuario]
        );

        const nomeUsuario = usuario.rows[0]?.nome || 'Usuário';

        res.status(201).json({
            message: 'Mensagem enviada com sucesso!',
            data: {
                ...result.rows[0],
                nome_remetente: nomeHospedagem,
                nome_destinatario: nomeUsuario,
                nome_hospedagem: nomeHospedagem
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao enviar mensagem',
            error: error.message
        });
        console.error('Erro ao enviar mensagem web:', error);
    } finally {
        if (client) client.release();
    }
}

async function buscarConversaWeb(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idhospedagem, idusuario } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        if (!idhospedagem || !idusuario) {
            return res.status(400).json({
                message: 'idhospedagem e idusuario são obrigatórios'
            });
        }

        if (!isValidId(idhospedagem) || !isValidId(idusuario)) {
            return res.status(400).json({
                message: 'IDs inválidos'
            });
        }

        // Buscar conversa completa entre hospedagem e usuário
        const query = `
            SELECT 
                m.idmensagem,
                m.id_remetente,
                m.id_destinatario,
                m.mensagem,
                m.data_envio,
                m.lida,
                CASE 
                    WHEN m.id_remetente = $1 THEN h.nome
                    ELSE ur.nome 
                END as nome_remetente,
                CASE 
                    WHEN m.id_destinatario = $2 THEN ud.nome
                    ELSE h2.nome 
                END as nome_destinatario,
                h.nome as nome_hospedagem
            FROM mensagens m
            LEFT JOIN hospedagem h ON m.id_remetente = h.idhospedagem
            LEFT JOIN hospedagem h2 ON m.id_destinatario = h2.idhospedagem
            LEFT JOIN usuario ur ON m.id_remetente = ur.idusuario
            LEFT JOIN usuario ud ON m.id_destinatario = ud.idusuario
            WHERE (m.id_remetente = $1 AND m.id_destinatario = $2)    -- Hospedagem → Usuário
               OR (m.id_remetente = $2 AND m.id_destinatario = $1)    -- Usuário → Hospedagem
            ORDER BY m.data_envio ASC
            LIMIT $3 OFFSET $4
        `;

        const result = await client.query(query, [idhospedagem, idusuario, limit, offset]);
        
        res.status(200).json({
            conversa: result.rows,
            participantes: {
                idhospedagem: parseInt(idhospedagem),
                idusuario: parseInt(idusuario),
                nome_hospedagem: result.rows[0]?.nome_hospedagem || 'Hospedagem'
            },
            paginacao: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rows.length
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar conversa',
            error: error.message
        });
        console.error('Erro ao buscar conversa web:', error);
    } finally {
        if (client) client.release();
    }
}

async function listarConversasWeb(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idhospedagem } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        if (!idhospedagem) {
            return res.status(400).json({
                message: 'ID da hospedagem é obrigatório'
            });
        }

        if (!isValidId(idhospedagem)) {
            return res.status(400).json({
                message: 'ID da hospedagem inválido'
            });
        }

        // Buscar conversas da hospedagem com usuários
        const query = `
            SELECT DISTINCT ON (
                CASE 
                    WHEN m.id_remetente = $1 THEN m.id_destinatario 
                    ELSE m.id_remetente 
                END
            )
                CASE 
                    WHEN m.id_remetente = $1 THEN m.id_destinatario 
                    ELSE m.id_remetente 
                END as idcontato,
                u.nome as nome_contato,
                'usuario' as tipo_contato,
                m.mensagem as ultima_mensagem,
                m.data_envio as ultima_data,
                m.lida,
                (SELECT COUNT(*) 
                 FROM mensagens 
                 WHERE id_remetente = $1 
                 AND id_destinatario = CASE 
                    WHEN m.id_remetente = $1 THEN m.id_destinatario 
                    ELSE m.id_remetente 
                 END
                 AND lida = false) as nao_lidas
            FROM mensagens m
            INNER JOIN usuario u ON (
                CASE 
                    WHEN m.id_remetente = $1 THEN m.id_destinatario 
                    ELSE m.id_remetente 
                END
            ) = u.idusuario
            WHERE m.id_remetente = $1 OR m.id_destinatario = $1
            ORDER BY 
                CASE 
                    WHEN m.id_remetente = $1 THEN m.id_destinatario 
                    ELSE m.id_remetente 
                END,
                m.data_envio DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await client.query(query, [idhospedagem, limit, offset]);
        
        res.status(200).json({
            conversas: result.rows,
            paginacao: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rows.length
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar conversas',
            error: error.message
        });
        console.error('Erro ao listar conversas web:', error);
    } finally {
        if (client) client.release();
    }
}

// ==================== MÉTODOS COMPLEMENTARES ====================

async function marcarComoLida(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idmensagem } = req.params;

        if (!isValidId(idmensagem)) {
            return res.status(400).json({
                message: 'ID da mensagem inválido'
            });
        }

        const result = await client.query(
            'UPDATE mensagens SET lida = true WHERE idmensagem = $1 RETURNING *',
            [idmensagem]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Mensagem não encontrada'
            });
        }

        res.status(200).json({
            message: 'Mensagem marcada como lida!',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao marcar mensagem como lida',
            error: error.message
        });
        console.error('Erro ao marcar mensagem como lida:', error);
    } finally {
        if (client) client.release();
    }
}

async function contarNaoLidasMobile(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario } = req.params;

        if (!idusuario) {
            return res.status(400).json({
                message: 'ID do usuário é obrigatório'
            });
        }

        if (!isValidId(idusuario)) {
            return res.status(400).json({
                message: 'ID do usuário inválido'
            });
        }

        const result = await client.query(
            'SELECT COUNT(*) as total_nao_lidas FROM mensagens WHERE id_destinatario = $1 AND lida = false',
            [idusuario]
        );

        res.status(200).json({
            total_nao_lidas: parseInt(result.rows[0].total_nao_lidas)
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao contar mensagens não lidas',
            error: error.message
        });
        console.error('Erro ao contar mensagens não lidas:', error);
    } finally {
        if (client) client.release();
    }
}

async function contarNaoLidasWeb(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idhospedagem } = req.params;

        if (!idhospedagem) {
            return res.status(400).json({
                message: 'ID da hospedagem é obrigatório'
            });
        }

        if (!isValidId(idhospedagem)) {
            return res.status(400).json({
                message: 'ID da hospedagem inválido'
            });
        }

        const result = await client.query(
            'SELECT COUNT(*) as total_nao_lidas FROM mensagens WHERE id_destinatario = $1 AND lida = false',
            [idhospedagem]
        );

        res.status(200).json({
            total_nao_lidas: parseInt(result.rows[0].total_nao_lidas)
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao contar mensagens não lidas',
            error: error.message
        });
        console.error('Erro ao contar mensagens não lidas:', error);
    } finally {
        if (client) client.release();
    }
}

module.exports = {
    // Métodos Mobile
    enviarMensagemMobile,
    buscarConversaMobile,
    listarConversasMobile,
    contarNaoLidasMobile,
    
    // Métodos Web
    enviarMensagemWeb,
    buscarConversaWeb,
    listarConversasWeb,
    contarNaoLidasWeb,
    
    // Métodos Complementares
    marcarComoLida
};