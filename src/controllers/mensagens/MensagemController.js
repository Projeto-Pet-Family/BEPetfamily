// controllers/mensagensController.js
const pool = require('../../connections/SQLConnections.js');

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

        const query = `
            SELECT 
                m.idmensagem,
                m.idusuario_remetente,
                m.idusuario_destinatario,
                m.assunto,
                m.mensagem,
                m.data_envio,
                m.lida,
                m.arquivada,
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
        res.status(200).send(result.rows);

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

        const query = `
            SELECT 
                m.idmensagem,
                m.idusuario_remetente,
                m.idusuario_destinatario,
                m.assunto,
                m.mensagem,
                m.data_envio,
                m.lida,
                m.arquivada,
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
        res.status(200).send(result.rows);

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

        res.status(200).send(result.rows[0]);

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
        const { idusuario_remetente, idusuario_destinatario, assunto, mensagem } = req.body;

        // Validações
        if (!idusuario_remetente || !idusuario_destinatario || !assunto || !mensagem) {
            return res.status(400).json({
                message: 'Todos os campos são obrigatórios'
            });
        }

        if (idusuario_remetente === idusuario_destinatario) {
            return res.status(400).json({
                message: 'Não é possível enviar mensagem para si mesmo'
            });
        }

        // Verificar se usuários existem
        const usuarioRemetente = await client.query(
            'SELECT idusuario FROM usuario WHERE idusuario = $1',
            [idusuario_remetente]
        );

        const usuarioDestinatario = await client.query(
            'SELECT idusuario FROM usuario WHERE idusuario = $1',
            [idusuario_destinatario]
        );

        if (usuarioRemetente.rows.length === 0 || usuarioDestinatario.rows.length === 0) {
            return res.status(404).json({
                message: 'Usuário remetente ou destinatário não encontrado'
            });
        }

        const result = await client.query(
            `INSERT INTO mensagens 
             (idusuario_remetente, idusuario_destinatario, assunto, mensagem)
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [idusuario_remetente, idusuario_destinatario, assunto, mensagem]
        );

        res.status(201).json({
            message: 'Mensagem enviada com sucesso!',
            data: result.rows[0]
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

async function arquivarMensagem(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idmensagem } = req.params;

        const result = await client.query(
            'UPDATE mensagens SET arquivada = true WHERE idmensagem = $1 RETURNING *',
            [idmensagem]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Mensagem não encontrada'
            });
        }

        res.status(200).json({
            message: 'Mensagem arquivada com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao arquivar mensagem',
            error: error.message
        });
        console.error('Erro ao arquivar mensagem:', error);
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

module.exports = {
    listarMensagens,
    buscarConversa,
    buscarMensagem,
    enviarMensagem,
    marcarComoLida,
    marcarVariasComoLidas,
    arquivarMensagem,
    contarNaoLidas,
    deletarMensagem
};