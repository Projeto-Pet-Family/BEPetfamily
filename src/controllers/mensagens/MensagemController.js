const pool = require('../../connections/SQLConnections.js');

// Função auxiliar para validar IDs
function isValidId(id) {
    return !isNaN(id) && parseInt(id) > 0;
}

async function listarMensagens(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario } = req.params;
        const { limit = 50, offset = 0 } = req.query;

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

        const query = `
            SELECT 
                m.idmensagem,
                m.idusuario_remetente,
                m.idusuario_destinatario,
                m.mensagem,
                m.data_envio,
                m.lida,
                ur.nome as nome_remetente,
                ud.nome as nome_destinatario
            FROM mensagens m
            INNER JOIN usuario ur ON m.idusuario_remetente = ur.idusuario
            INNER JOIN usuario ud ON m.idusuario_destinatario = ud.idusuario
            WHERE m.idusuario_remetente = $1 OR m.idusuario_destinatario = $1
            ORDER BY m.data_envio DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await client.query(query, [idusuario, limit, offset]);
        
        res.status(200).json({
            mensagens: result.rows,
            paginacao: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rows.length
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar mensagens',
            error: error.message
        });
        console.error('Erro ao listar mensagens:', error);
    } finally {
        if (client) client.release();
    }
}

async function buscarConversa(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario1, idusuario2 } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        if (!idusuario1 || !idusuario2) {
            return res.status(400).json({
                message: 'IDs dos usuários são obrigatórios'
            });
        }

        if (!isValidId(idusuario1) || !isValidId(idusuario2)) {
            return res.status(400).json({
                message: 'IDs dos usuários inválidos'
            });
        }

        const query = `
            SELECT 
                m.idmensagem,
                m.idusuario_remetente,
                m.idusuario_destinatario,
                m.mensagem,
                m.data_envio,
                m.lida,
                ur.nome as nome_remetente,
                ud.nome as nome_destinatario
            FROM mensagens m
            INNER JOIN usuario ur ON m.idusuario_remetente = ur.idusuario
            INNER JOIN usuario ud ON m.idusuario_destinatario = ud.idusuario
            WHERE (m.idusuario_remetente = $1 AND m.idusuario_destinatario = $2)
               OR (m.idusuario_remetente = $2 AND m.idusuario_destinatario = $1)
            ORDER BY m.data_envio ASC
            LIMIT $3 OFFSET $4
        `;

        const result = await client.query(query, [idusuario1, idusuario2, limit, offset]);
        
        res.status(200).json({
            conversa: result.rows,
            participantes: {
                usuario1: idusuario1,
                usuario2: idusuario2
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
        console.error('Erro ao buscar conversa:', error);
    } finally {
        if (client) client.release();
    }
}

async function buscarMensagem(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idmensagem } = req.params;

        if (!isValidId(idmensagem)) {
            return res.status(400).json({
                message: 'ID da mensagem inválido'
            });
        }

        const query = `
            SELECT 
                m.*,
                ur.nome as nome_remetente,
                ud.nome as nome_destinatario
            FROM mensagens m
            INNER JOIN usuario ur ON m.idusuario_remetente = ur.idusuario
            INNER JOIN usuario ud ON m.idusuario_destinatario = ud.idusuario
            WHERE m.idmensagem = $1
        `;

        const result = await client.query(query, [idmensagem]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Mensagem não encontrada'
            });
        }

        res.status(200).json({
            mensagem: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar mensagem',
            error: error.message
        });
        console.error('Erro ao buscar mensagem:', error);
    } finally {
        if (client) client.release();
    }
}

async function enviarMensagem(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario_remetente, idusuario_destinatario, mensagem } = req.body;

        // Validações
        if (!idusuario_remetente || !idusuario_destinatario || !mensagem) {
            return res.status(400).json({
                message: 'Todos os campos são obrigatórios'
            });
        }

        if (!isValidId(idusuario_remetente) || !isValidId(idusuario_destinatario)) {
            return res.status(400).json({
                message: 'IDs dos usuários inválidos'
            });
        }

        if (idusuario_remetente === idusuario_destinatario) {
            return res.status(400).json({
                message: 'Não é possível enviar mensagem para si mesmo'
            });
        }

        if (mensagem.trim().length === 0) {
            return res.status(400).json({
                message: 'A mensagem não pode estar vazia'
            });
        }

        // Verificar se usuários existem
        const usuarioRemetente = await client.query(
            'SELECT idusuario, nome FROM usuario WHERE idusuario = $1',
            [idusuario_remetente]
        );

        const usuarioDestinatario = await client.query(
            'SELECT idusuario, nome FROM usuario WHERE idusuario = $1',
            [idusuario_destinatario]
        );

        if (usuarioRemetente.rows.length === 0) {
            return res.status(404).json({
                message: 'Usuário remetente não encontrado'
            });
        }

        if (usuarioDestinatario.rows.length === 0) {
            return res.status(404).json({
                message: 'Usuário destinatário não encontrado'
            });
        }

        const result = await client.query(
            `INSERT INTO mensagens 
             (idusuario_remetente, idusuario_destinatario, mensagem)
             VALUES ($1, $2, $3) 
             RETURNING *`,
            [idusuario_remetente, idusuario_destinatario, mensagem.trim()]
        );

        res.status(201).json({
            message: 'Mensagem enviada com sucesso!',
            data: {
                ...result.rows[0],
                nome_remetente: usuarioRemetente.rows[0].nome,
                nome_destinatario: usuarioDestinatario.rows[0].nome
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao enviar mensagem',
            error: error.message
        });
        console.error('Erro ao enviar mensagem:', error);
    } finally {
        if (client) client.release();
    }
}

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

async function marcarVariasComoLidas(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idsMensagens } = req.body;

        if (!Array.isArray(idsMensagens) || idsMensagens.length === 0) {
            return res.status(400).json({
                message: 'Lista de IDs de mensagens é obrigatória'
            });
        }

        // Validar todos os IDs
        for (const id of idsMensagens) {
            if (!isValidId(id)) {
                return res.status(400).json({
                    message: `ID de mensagem inválido: ${id}`
                });
            }
        }

        const placeholders = idsMensagens.map((_, index) => `$${index + 1}`).join(',');
        const query = `
            UPDATE mensagens 
            SET lida = true 
            WHERE idmensagem IN (${placeholders})
            RETURNING *
        `;

        const result = await client.query(query, idsMensagens);

        res.status(200).json({
            message: `${result.rows.length} mensagens marcadas como lidas!`,
            data: result.rows
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao marcar mensagens como lidas',
            error: error.message
        });
        console.error('Erro ao marcar mensagens como lidas:', error);
    } finally {
        if (client) client.release();
    }
}

async function contarNaoLidas(req, res) {
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
            'SELECT COUNT(*) as total_nao_lidas FROM mensagens WHERE idusuario_destinatario = $1 AND lida = false',
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

async function deletarMensagem(req, res) {
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
            'DELETE FROM mensagens WHERE idmensagem = $1 RETURNING *',
            [idmensagem]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Mensagem não encontrada'
            });
        }

        res.status(200).json({
            message: 'Mensagem removida com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao remover mensagem',
            error: error.message
        });
        console.error('Erro ao remover mensagem:', error);
    } finally {
        if (client) client.release();
    }
}

// Função adicional: Listar conversas resumidas
async function listarConversas(req, res) {
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

        const query = `
            SELECT 
                DISTINCT ON (
                    CASE 
                        WHEN m.idusuario_remetente = $1 THEN m.idusuario_destinatario 
                        ELSE m.idusuario_remetente 
                    END
                )
                CASE 
                    WHEN m.idusuario_remetente = $1 THEN m.idusuario_destinatario 
                    ELSE m.idusuario_remetente 
                END as idusuario_contato,
                CASE 
                    WHEN m.idusuario_remetente = $1 THEN ud.nome 
                    ELSE ur.nome 
                END as nome_contato,
                m.mensagem as ultima_mensagem,
                m.data_envio as ultima_data,
                m.lida,
                (SELECT COUNT(*) 
                 FROM mensagens 
                 WHERE ((idusuario_remetente = $1 AND idusuario_destinatario = 
                        CASE 
                            WHEN m.idusuario_remetente = $1 THEN m.idusuario_destinatario 
                            ELSE m.idusuario_remetente 
                        END)
                     OR (idusuario_destinatario = $1 AND idusuario_remetente = 
                        CASE 
                            WHEN m.idusuario_remetente = $1 THEN m.idusuario_destinatario 
                            ELSE m.idusuario_remetente 
                        END))
                 AND lida = false AND idusuario_destinatario = $1) as nao_lidas
            FROM mensagens m
            INNER JOIN usuario ur ON m.idusuario_remetente = ur.idusuario
            INNER JOIN usuario ud ON m.idusuario_destinatario = ud.idusuario
            WHERE m.idusuario_remetente = $1 OR m.idusuario_destinatario = $1
            ORDER BY 
                CASE 
                    WHEN m.idusuario_remetente = $1 THEN m.idusuario_destinatario 
                    ELSE m.idusuario_remetente 
                END,
                m.data_envio DESC
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
        console.error('Erro ao listar conversas:', error);
    } finally {
        if (client) client.release();
    }
}

async function enviarMensagemMobile(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario, idhospedagem, mensagem } = req.body;

        // Validações
        if (!idusuario || !idhospedagem || !mensagem) {
            return res.status(400).json({
                message: 'idusuario, idhospedagem e mensagem são obrigatórios'
            });
        }

        if (mensagem.trim().length === 0) {
            return res.status(400).json({
                message: 'A mensagem não pode estar vazia'
            });
        }

        // Verificar se o usuário existe
        const usuario = await client.query(
            'SELECT idusuario, nome FROM usuario WHERE idusuario = $1',
            [idusuario]
        );

        if (usuario.rows.length === 0) {
            return res.status(404).json({
                message: 'Usuário não encontrado'
            });
        }

        // Verificar se a hospedagem existe
        const hospedagem = await client.query(
            'SELECT idhospedagem, nome FROM hospedagem WHERE idhospedagem = $1',
            [idhospedagem]
        );

        if (hospedagem.rows.length === 0) {
            return res.status(404).json({
                message: 'Hospedagem não encontrada'
            });
        }

        // Criar ou obter usuário especial para a hospedagem
        // Usamos um ID negativo ou um padrão para identificar hospedagens
        const idHospedagemUsuario = -idhospedagem; // ID negativo para identificar como hospedagem
        const nomeHospedagem = hospedagem.rows[0].nome;

        // Inserir mensagem no banco - usuário envia para a "hospedagem" (ID negativo)
        const result = await client.query(
            `INSERT INTO mensagens 
             (idusuario_remetente, idusuario_destinatario, mensagem)
             VALUES ($1, $2, $3) 
             RETURNING *`,
            [idusuario, idHospedagemUsuario, mensagem.trim()]
        );

        res.status(201).json({
            message: 'Mensagem enviada com sucesso!',
            data: {
                ...result.rows[0],
                nome_remetente: usuario.rows[0].nome,
                nome_destinatario: nomeHospedagem, // Nome da hospedagem como "usuário"
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

        // Verificar se a hospedagem existe
        const hospedagem = await client.query(
            'SELECT idhospedagem, nome FROM hospedagem WHERE idhospedagem = $1',
            [idhospedagem]
        );

        if (hospedagem.rows.length === 0) {
            return res.status(404).json({
                message: 'Hospedagem não encontrada'
            });
        }

        const nomeHospedagem = hospedagem.rows[0].nome;
        const idHospedagemUsuario = -idhospedagem; // Mesmo ID negativo

        // Buscar conversa entre o usuário e a hospedagem (ID negativo)
        const query = `
            SELECT 
                m.idmensagem,
                m.idusuario_remetente,
                m.idusuario_destinatario,
                m.mensagem,
                m.data_envio,
                m.lida,
                ur.nome as nome_remetente,
                $2 as nome_destinatario
            FROM mensagens m
            INNER JOIN usuario ur ON m.idusuario_remetente = ur.idusuario
            WHERE (m.idusuario_remetente = $1 AND m.idusuario_destinatario = $3)
               OR (m.idusuario_remetente = $3 AND m.idusuario_destinatario = $1)
            ORDER BY m.data_envio ASC
            LIMIT $4 OFFSET $5
        `;

        const result = await client.query(query, [idusuario, nomeHospedagem, idHospedagemUsuario, limit, offset]);
        
        res.status(200).json({
            conversa: result.rows,
            participantes: {
                idusuario: parseInt(idusuario),
                idhospedagem: parseInt(idhospedagem),
                nome_hospedagem: nomeHospedagem
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

        // Buscar o ID do proprietário da hospedagem
        const proprietarioHospedagem = await client.query(
            'SELECT idusuario FROM hospedagem WHERE idhospedagem = $1',
            [idhospedagem]
        );

        if (proprietarioHospedagem.rows.length === 0) {
            return res.status(404).json({
                message: 'Hospedagem não encontrada'
            });
        }

        const idProprietario = proprietarioHospedagem.rows[0].idusuario;

        // Buscar conversa entre o usuário e o proprietário da hospedagem
        const query = `
            SELECT 
                m.idmensagem,
                m.idusuario_remetente,
                m.idusuario_destinatario,
                m.mensagem,
                m.data_envio,
                m.lida,
                ur.nome as nome_remetente,
                ud.nome as nome_destinatario
            FROM mensagens m
            INNER JOIN usuario ur ON m.idusuario_remetente = ur.idusuario
            INNER JOIN usuario ud ON m.idusuario_destinatario = ud.idusuario
            WHERE (m.idusuario_remetente = $1 AND m.idusuario_destinatario = $2)
               OR (m.idusuario_remetente = $2 AND m.idusuario_destinatario = $1)
            ORDER BY m.data_envio ASC
            LIMIT $3 OFFSET $4
        `;

        const result = await client.query(query, [idusuario, idProprietario, limit, offset]);
        
        res.status(200).json({
            conversa: result.rows,
            participantes: {
                idusuario: parseInt(idusuario),
                idhospedagem: parseInt(idhospedagem),
                idproprietario: idProprietario
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

        // Buscar hospedagens que o usuário tem contrato
        const query = `
            SELECT 
                h.idhospedagem as idcontato,
                h.nome as nome_contato,
                'hospedagem' as tipo_contato,
                COALESCE(
                    (SELECT m.mensagem 
                     FROM mensagens m 
                     WHERE m.idusuario_remetente = $1 
                     AND m.idusuario_destinatario = (10000 + h.idhospedagem)
                     ORDER BY m.data_envio DESC 
                     LIMIT 1),
                    (SELECT m.mensagem 
                     FROM mensagens m 
                     WHERE m.idusuario_remetente = (10000 + h.idhospedagem)
                     AND m.idusuario_destinatario = $1
                     ORDER BY m.data_envio DESC 
                     LIMIT 1),
                    'Nenhuma mensagem ainda'
                ) as ultima_mensagem,
                COALESCE(
                    (SELECT m.data_envio 
                     FROM mensagens m 
                     WHERE (m.idusuario_remetente = $1 AND m.idusuario_destinatario = (10000 + h.idhospedagem))
                        OR (m.idusuario_remetente = (10000 + h.idhospedagem) AND m.idusuario_destinatario = $1)
                     ORDER BY m.data_envio DESC 
                     LIMIT 1),
                    NOW()
                ) as ultima_data,
                (SELECT COUNT(*) 
                 FROM mensagens 
                 WHERE idusuario_destinatario = $1 
                 AND idusuario_remetente = (10000 + h.idhospedagem)
                 AND lida = false) as nao_lidas
            FROM hospedagem h
            INNER JOIN contrato c ON h.idhospedagem = c.idhospedagem
            WHERE c.idusuario = $1
            ORDER BY ultima_data DESC
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
            'SELECT COUNT(*) as total_nao_lidas FROM mensagens WHERE idusuario_destinatario = $1 AND lida = false',
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
        console.error('Erro ao contar mensagens não lidas mobile:', error);
    } finally {
        if (client) client.release();
    }
}

module.exports = {
    listarMensagens,
    buscarConversa,
    buscarMensagem,
    enviarMensagem,
    marcarComoLida,
    marcarVariasComoLidas,
    contarNaoLidas,
    deletarMensagem,
    listarConversas,
    enviarMensagemMobile,
    buscarConversaMobile,
    listarConversasMobile,
    contarNaoLidasMobile
};