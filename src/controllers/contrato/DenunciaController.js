const pool = require('../../connections/SQLConnections.js');

// Função para buscar denúncia com relacionamentos
async function buscarDenunciaComRelacionamentos(client, idDenuncia) {
    try {
        const denunciaQuery = `
            SELECT d.*, c.idcontrato, h.nome as hospedagem_nome, u.nome as usuario_nome,
                   u.email as usuario_email, c.datainicio, c.datafim
            FROM denuncia d
            LEFT JOIN contrato c ON d.idcontrato = c.idcontrato
            LEFT JOIN hospedagem h ON d.idhospedagem = h.idhospedagem
            LEFT JOIN usuario u ON d.idusuario = u.idusuario
            WHERE d.iddenuncia = $1
        `;
        
        const denunciaResult = await client.query(denunciaQuery, [idDenuncia]);
        const denuncia = denunciaResult.rows[0];
        if (!denuncia) return null;

        return denuncia;
    } catch (error) {
        console.error('Erro ao buscar denúncia com relacionamentos:', error);
        throw error;
    }
}

// Validações
function validarDataDenuncia(dataDenuncia) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (dataDenuncia && new Date(dataDenuncia) > hoje) {
        throw new Error('Data de denúncia não pode ser futura');
    }
}

// Função para construir query de update dinâmica
function construirQueryUpdateDenuncia(campos, idDenuncia) {
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(campos).forEach(([key, value]) => {
        if (value !== undefined) {
            updateFields.push(`${key} = $${paramCount}`);
            values.push(value);
            paramCount++;
        }
    });

    if (updateFields.length === 0) {
        throw new Error('Nenhum campo válido para atualização fornecido');
    }

    values.push(idDenuncia);
    updateFields.push('dataatualizacao = CURRENT_TIMESTAMP');

    return {
        query: `UPDATE denuncia SET ${updateFields.join(', ')} WHERE iddenuncia = $${paramCount} RETURNING *`,
        values
    };
}

// Controladores principais
async function lerDenuncias(req, res) {
    let client;
    try {
        client = await pool.connect();
        const query = `
            SELECT d.*, c.idcontrato, h.nome as hospedagem_nome, u.nome as usuario_nome,
                   c.datainicio, c.datafim
            FROM denuncia d
            LEFT JOIN contrato c ON d.idcontrato = c.idcontrato
            LEFT JOIN hospedagem h ON d.idhospedagem = h.idhospedagem
            LEFT JOIN usuario u ON d.idusuario = u.idusuario
            ORDER BY d.data_denuncia DESC, d.datacriacao DESC
        `;
        
        const result = await client.query(query);
        const denunciasCompletas = await Promise.all(
            result.rows.map(denuncia => 
                buscarDenunciaComRelacionamentos(client, denuncia.iddenuncia)
            )
        );

        res.status(200).json(denunciasCompletas);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao listar denúncias', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function buscarDenunciaPorId(req, res) {
    let client;
    try {
        client = await pool.connect();
        const denunciaCompleta = await buscarDenunciaComRelacionamentos(client, req.params.idDenuncia);
        
        if (!denunciaCompleta) {
            return res.status(404).json({ message: 'Denúncia não encontrada' });
        }

        res.status(200).json(denunciaCompleta);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar denúncia', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function criarDenuncia(req, res) {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const { idContrato, idHospedagem, idUsuario, comentario, dataDenuncia = new Date().toISOString().split('T')[0] } = req.body;

        // Validações
        if (!idContrato || !idHospedagem || !idUsuario || !comentario) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'idContrato, idHospedagem, idUsuario e comentario são obrigatórios' });
        }

        if (comentario.trim().length < 10) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Comentário deve ter pelo menos 10 caracteres' });
        }

        validarDataDenuncia(dataDenuncia);

        // Verificações em paralelo
        const [contrato, hospedagem, usuario, denunciaExistente] = await Promise.all([
            client.query('SELECT idcontrato, idusuario, idhospedagem FROM contrato WHERE idcontrato = $1', [idContrato]),
            client.query('SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1', [idHospedagem]),
            client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]),
            client.query('SELECT iddenuncia FROM denuncia WHERE idcontrato = $1 AND idusuario = $2', [idContrato, idUsuario])
        ]);

        // Validações de existência e permissões
        if (contrato.rows.length === 0) throw new Error('Contrato não encontrado');
        if (hospedagem.rows.length === 0) throw new Error('Hospedagem não encontrada');
        if (usuario.rows.length === 0) throw new Error('Usuário não encontrado');
        
        // Verificar se o contrato pertence ao usuário
        const contratoData = contrato.rows[0];
        if (parseInt(contratoData.idusuario) !== parseInt(idUsuario)) {
            throw new Error('Usuário não tem permissão para denunciar este contrato');
        }

        // Verificar se o contrato pertence à hospedagem
        if (parseInt(contratoData.idhospedagem) !== parseInt(idHospedagem)) {
            throw new Error('Contrato não pertence a esta hospedagem');
        }

        // Verificar se já existe denúncia para este contrato e usuário
        if (denunciaExistente.rows.length > 0) {
            throw new Error('Já existe uma denúncia para este contrato');
        }

        // Inserir denúncia
        const denunciaResult = await client.query(
            'INSERT INTO denuncia (idcontrato, idhospedagem, idusuario, comentario, data_denuncia) VALUES ($1, $2, $3, $4, $5) RETURNING iddenuncia',
            [idContrato, idHospedagem, idUsuario, comentario, dataDenuncia]
        );

        const idDenuncia = denunciaResult.rows[0].iddenuncia;

        await client.query('COMMIT');
        const denunciaCompleta = await buscarDenunciaComRelacionamentos(client, idDenuncia);

        res.status(201).json({ message: 'Denúncia criada com sucesso', data: denunciaCompleta });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ message: 'Erro ao criar denúncia', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function atualizarDenuncia(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idDenuncia } = req.params;
        const { comentario, dataDenuncia } = req.body;

        // Verificar se denúncia existe
        const denunciaExistente = await client.query('SELECT * FROM denuncia WHERE iddenuncia = $1', [idDenuncia]);
        if (denunciaExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Denúncia não encontrada' });
        }

        // Validações
        if (comentario && comentario.trim().length < 10) {
            return res.status(400).json({ message: 'Comentário deve ter pelo menos 10 caracteres' });
        }

        validarDataDenuncia(dataDenuncia);

        // Construir e executar query
        const { query, values } = construirQueryUpdateDenuncia({
            comentario: comentario,
            data_denuncia: dataDenuncia
        }, idDenuncia);

        await client.query(query, values);
        const denunciaCompleta = await buscarDenunciaComRelacionamentos(client, idDenuncia);

        res.status(200).json({ message: 'Denúncia atualizada com sucesso', data: denunciaCompleta });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar denúncia', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function excluirDenuncia(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idDenuncia } = req.params;

        const denunciaExistente = await client.query('SELECT * FROM denuncia WHERE iddenuncia = $1', [idDenuncia]);
        if (denunciaExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Denúncia não encontrada' });
        }

        const denunciaCompleta = await buscarDenunciaComRelacionamentos(client, idDenuncia);
        await client.query('DELETE FROM denuncia WHERE iddenuncia = $1', [idDenuncia]);

        res.status(200).json({ message: 'Denúncia excluída com sucesso', data: denunciaCompleta });
    } catch (error) {
        const message = error.code === '23503' 
            ? 'Não é possível excluir a denúncia pois está sendo utilizada em outros registros'
            : 'Erro ao excluir denúncia';
        res.status(error.code === '23503' ? 400 : 500).json({ message, error: error.message });
    } finally {
        if (client) await client.release();
    }
}

// Métodos específicos
async function buscarDenunciasPorUsuario(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idUsuario } = req.params;
        
        const usuario = await client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]);
        if (usuario.rows.length === 0) return res.status(404).json({ message: 'Usuário não encontrado' });

        const query = `
            SELECT d.*, c.idcontrato, h.nome as hospedagem_nome, u.nome as usuario_nome,
                   c.datainicio, c.datafim
            FROM denuncia d
            LEFT JOIN contrato c ON d.idcontrato = c.idcontrato
            LEFT JOIN hospedagem h ON d.idhospedagem = h.idhospedagem
            LEFT JOIN usuario u ON d.idusuario = u.idusuario
            WHERE d.idusuario = $1
            ORDER BY d.data_denuncia DESC, d.datacriacao DESC
        `;

        const result = await client.query(query, [idUsuario]);
        const denunciasCompletas = await Promise.all(
            result.rows.map(denuncia => 
                buscarDenunciaComRelacionamentos(client, denuncia.iddenuncia)
            )
        );

        res.status(200).json(denunciasCompletas);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar denúncias do usuário', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function buscarDenunciasPorHospedagem(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idHospedagem } = req.params;
        
        const hospedagem = await client.query('SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1', [idHospedagem]);
        if (hospedagem.rows.length === 0) return res.status(404).json({ message: 'Hospedagem não encontrada' });

        const query = `
            SELECT d.*, c.idcontrato, h.nome as hospedagem_nome, u.nome as usuario_nome,
                   c.datainicio, c.datafim
            FROM denuncia d
            LEFT JOIN contrato c ON d.idcontrato = c.idcontrato
            LEFT JOIN hospedagem h ON d.idhospedagem = h.idhospedagem
            LEFT JOIN usuario u ON d.idusuario = u.idusuario
            WHERE d.idhospedagem = $1
            ORDER BY d.data_denuncia DESC, d.datacriacao DESC
        `;

        const result = await client.query(query, [idHospedagem]);
        const denunciasCompletas = await Promise.all(
            result.rows.map(denuncia => 
                buscarDenunciaComRelacionamentos(client, denuncia.iddenuncia)
            )
        );

        res.status(200).json({
            denuncias: denunciasCompletas,
            total_denuncias: result.rows.length
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar denúncias da hospedagem', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

module.exports = {
    lerDenuncias,
    buscarDenunciaPorId,
    criarDenuncia,
    atualizarDenuncia,
    excluirDenuncia,
    buscarDenunciasPorUsuario,
    buscarDenunciasPorHospedagem,
    buscarDenunciaComRelacionamentos
};