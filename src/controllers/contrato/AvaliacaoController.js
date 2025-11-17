const pool = require('../../connections/SQLConnections.js');

// Função para buscar avaliação com relacionamentos
async function buscarAvaliacaoComRelacionamentos(client, idAvaliacao) {
    try {
        const avaliacaoQuery = `
            SELECT a.*, c.idcontrato, h.nome as hospedagem_nome, u.nome as usuario_nome,
                   u.email as usuario_email, c.datainicio, c.datafim
            FROM avaliacao a
            LEFT JOIN contrato c ON a.idcontrato = c.idcontrato
            LEFT JOIN hospedagem h ON a.idhospedagem = h.idhospedagem
            LEFT JOIN usuario u ON a.idusuario = u.idusuario
            WHERE a.idavaliacao = $1
        `;
        
        const avaliacaoResult = await client.query(avaliacaoQuery, [idAvaliacao]);
        const avaliacao = avaliacaoResult.rows[0];
        if (!avaliacao) return null;

        // Formatar dados adicionais
        avaliacao.estrelas_descricao = `${avaliacao.estrelas} estrela(s)`;

        return avaliacao;
    } catch (error) {
        console.error('Erro ao buscar avaliação com relacionamentos:', error);
        throw error;
    }
}

// Validações
function validarEstrelas(estrelas) {
    return estrelas >= 1 && estrelas <= 5;
}

function validarDataAvaliacao(dataAvaliacao) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (dataAvaliacao && new Date(dataAvaliacao) > hoje) {
        throw new Error('Data de avaliação não pode ser futura');
    }
}

// Função para construir query de update dinâmica
function construirQueryUpdateAvaliacao(campos, idAvaliacao) {
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

    values.push(idAvaliacao);
    updateFields.push('dataatualizacao = CURRENT_TIMESTAMP');

    return {
        query: `UPDATE avaliacao SET ${updateFields.join(', ')} WHERE idavaliacao = $${paramCount} RETURNING *`,
        values
    };
}

// Controladores principais
async function lerAvaliacoes(req, res) {
    let client;
    try {
        client = await pool.connect();
        const query = `
            SELECT a.*, c.idcontrato, h.nome as hospedagem_nome, u.nome as usuario_nome,
                   c.datainicio, c.datafim
            FROM avaliacao a
            LEFT JOIN contrato c ON a.idcontrato = c.idcontrato
            LEFT JOIN hospedagem h ON a.idhospedagem = h.idhospedagem
            LEFT JOIN usuario u ON a.idusuario = u.idusuario
            ORDER BY a.data_avaliacao DESC, a.datacriacao DESC
        `;
        
        const result = await client.query(query);
        const avaliacoesCompletas = await Promise.all(
            result.rows.map(avaliacao => 
                buscarAvaliacaoComRelacionamentos(client, avaliacao.idavaliacao)
            )
        );

        res.status(200).json(avaliacoesCompletas);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao listar avaliações', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function buscarAvaliacaoPorId(req, res) {
    let client;
    try {
        client = await pool.connect();
        const avaliacaoCompleta = await buscarAvaliacaoComRelacionamentos(client, req.params.idAvaliacao);
        
        if (!avaliacaoCompleta) {
            return res.status(404).json({ message: 'Avaliação não encontrada' });
        }

        res.status(200).json(avaliacaoCompleta);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar avaliação', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function criarAvaliacao(req, res) {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const { idContrato, idHospedagem, idUsuario, comentario, estrelas, dataAvaliacao = new Date().toISOString().split('T')[0] } = req.body;

        // Validações
        if (!idContrato || !idHospedagem || !idUsuario || !estrelas) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'idContrato, idHospedagem, idUsuario e estrelas são obrigatórios' });
        }

        if (!validarEstrelas(estrelas)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Estrelas devem ser entre 1 e 5' });
        }

        validarDataAvaliacao(dataAvaliacao);

        // Verificações em paralelo
        const [contrato, hospedagem, usuario, avaliacaoExistente] = await Promise.all([
            client.query('SELECT idcontrato, idusuario, idhospedagem FROM contrato WHERE idcontrato = $1', [idContrato]),
            client.query('SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1', [idHospedagem]),
            client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]),
            client.query('SELECT idavaliacao FROM avaliacao WHERE idcontrato = $1 AND idusuario = $2', [idContrato, idUsuario])
        ]);

        // Validações de existência e permissões
        if (contrato.rows.length === 0) throw new Error('Contrato não encontrado');
        if (hospedagem.rows.length === 0) throw new Error('Hospedagem não encontrada');
        if (usuario.rows.length === 0) throw new Error('Usuário não encontrado');
        
        // Verificar se o contrato pertence ao usuário
        const contratoData = contrato.rows[0];
        if (parseInt(contratoData.idusuario) !== parseInt(idUsuario)) {
            throw new Error('Usuário não tem permissão para avaliar este contrato');
        }

        // Verificar se o contrato pertence à hospedagem
        if (parseInt(contratoData.idhospedagem) !== parseInt(idHospedagem)) {
            throw new Error('Contrato não pertence a esta hospedagem');
        }

        // Verificar se já existe avaliação para este contrato e usuário
        if (avaliacaoExistente.rows.length > 0) {
            throw new Error('Já existe uma avaliação para este contrato');
        }

        // Inserir avaliação
        const avaliacaoResult = await client.query(
            'INSERT INTO avaliacao (idcontrato, idhospedagem, idusuario, comentario, estrelas, data_avaliacao) VALUES ($1, $2, $3, $4, $5, $6) RETURNING idavaliacao',
            [idContrato, idHospedagem, idUsuario, comentario, estrelas, dataAvaliacao]
        );

        const idAvaliacao = avaliacaoResult.rows[0].idavaliacao;

        await client.query('COMMIT');
        const avaliacaoCompleta = await buscarAvaliacaoComRelacionamentos(client, idAvaliacao);

        res.status(201).json({ message: 'Avaliação criada com sucesso', data: avaliacaoCompleta });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ message: 'Erro ao criar avaliação', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function atualizarAvaliacao(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idAvaliacao } = req.params;
        const { comentario, estrelas, dataAvaliacao } = req.body;

        // Verificar se avaliação existe
        const avaliacaoExistente = await client.query('SELECT * FROM avaliacao WHERE idavaliacao = $1', [idAvaliacao]);
        if (avaliacaoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Avaliação não encontrada' });
        }

        // Validações
        if (estrelas && !validarEstrelas(estrelas)) {
            return res.status(400).json({ message: 'Estrelas devem ser entre 1 e 5' });
        }

        validarDataAvaliacao(dataAvaliacao);

        // Construir e executar query
        const { query, values } = construirQueryUpdateAvaliacao({
            comentario: comentario,
            estrelas: estrelas,
            data_avaliacao: dataAvaliacao
        }, idAvaliacao);

        await client.query(query, values);
        const avaliacaoCompleta = await buscarAvaliacaoComRelacionamentos(client, idAvaliacao);

        res.status(200).json({ message: 'Avaliação atualizada com sucesso', data: avaliacaoCompleta });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar avaliação', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function excluirAvaliacao(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idAvaliacao } = req.params;

        const avaliacaoExistente = await client.query('SELECT * FROM avaliacao WHERE idavaliacao = $1', [idAvaliacao]);
        if (avaliacaoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Avaliação não encontrada' });
        }

        const avaliacaoCompleta = await buscarAvaliacaoComRelacionamentos(client, idAvaliacao);
        await client.query('DELETE FROM avaliacao WHERE idavaliacao = $1', [idAvaliacao]);

        res.status(200).json({ message: 'Avaliação excluída com sucesso', data: avaliacaoCompleta });
    } catch (error) {
        const message = error.code === '23503' 
            ? 'Não é possível excluir a avaliação pois está sendo utilizada em outros registros'
            : 'Erro ao excluir avaliação';
        res.status(error.code === '23503' ? 400 : 500).json({ message, error: error.message });
    } finally {
        if (client) await client.release();
    }
}

// Métodos específicos
async function buscarAvaliacoesPorUsuario(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idUsuario } = req.params;
        
        const usuario = await client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]);
        if (usuario.rows.length === 0) return res.status(404).json({ message: 'Usuário não encontrado' });

        const query = `
            SELECT a.*, c.idcontrato, h.nome as hospedagem_nome, u.nome as usuario_nome,
                   c.datainicio, c.datafim
            FROM avaliacao a
            LEFT JOIN contrato c ON a.idcontrato = c.idcontrato
            LEFT JOIN hospedagem h ON a.idhospedagem = h.idhospedagem
            LEFT JOIN usuario u ON a.idusuario = u.idusuario
            WHERE a.idusuario = $1
            ORDER BY a.data_avaliacao DESC, a.datacriacao DESC
        `;

        const result = await client.query(query, [idUsuario]);
        const avaliacoesCompletas = await Promise.all(
            result.rows.map(avaliacao => 
                buscarAvaliacaoComRelacionamentos(client, avaliacao.idavaliacao)
            )
        );

        res.status(200).json(avaliacoesCompletas);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar avaliações do usuário', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function buscarAvaliacoesPorHospedagem(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idHospedagem } = req.params;
        
        const hospedagem = await client.query('SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1', [idHospedagem]);
        if (hospedagem.rows.length === 0) return res.status(404).json({ message: 'Hospedagem não encontrada' });

        const query = `
            SELECT a.*, c.idcontrato, h.nome as hospedagem_nome, u.nome as usuario_nome,
                   c.datainicio, c.datafim
            FROM avaliacao a
            LEFT JOIN contrato c ON a.idcontrato = c.idcontrato
            LEFT JOIN hospedagem h ON a.idhospedagem = h.idhospedagem
            LEFT JOIN usuario u ON a.idusuario = u.idusuario
            WHERE a.idhospedagem = $1
            ORDER BY a.data_avaliacao DESC, a.datacriacao DESC
        `;

        const result = await client.query(query, [idHospedagem]);

        // Calcular estatísticas
        const estatisticas = {
            total_avaliacoes: result.rows.length,
            media_estrelas: 0,
            distribuicao_estrelas: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };

        if (result.rows.length > 0) {
            const somaEstrelas = result.rows.reduce((total, avaliacao) => {
                estatisticas.distribuicao_estrelas[avaliacao.estrelas]++;
                return total + avaliacao.estrelas;
            }, 0);
            estatisticas.media_estrelas = (somaEstrelas / result.rows.length).toFixed(1);
        }

        const avaliacoesCompletas = await Promise.all(
            result.rows.map(avaliacao => 
                buscarAvaliacaoComRelacionamentos(client, avaliacao.idavaliacao)
            )
        );

        res.status(200).json({
            avaliacoes: avaliacoesCompletas,
            estatisticas: estatisticas
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar avaliações da hospedagem', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

module.exports = {
    lerAvaliacoes,
    buscarAvaliacaoPorId,
    criarAvaliacao,
    atualizarAvaliacao,
    excluirAvaliacao,
    buscarAvaliacoesPorUsuario,
    buscarAvaliacoesPorHospedagem,
    buscarAvaliacaoComRelacionamentos
};