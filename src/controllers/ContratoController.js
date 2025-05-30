const sqlconnection = require('../connections/SQLConnections.js');

async function lerContratos(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const query = `
            SELECT c.*, h.nome as hospedagem_nome, u.nome as usuario_nome, s.descricao as status_descricao
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Usuario u ON c.idUsuario = u.idUsuario
            LEFT JOIN Status s ON c.idStatus = s.idStatus
        `;
        const [result] = await sql.query(query);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar contratos',
            error: error.message
        });
        console.error('Erro ao listar contratos:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarContratoPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idContrato } = req.params;
        
        const query = `
            SELECT c.*, h.nome as hospedagem_nome, u.nome as usuario_nome, s.descricao as status_descricao
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Usuario u ON c.idUsuario = u.idUsuario
            LEFT JOIN Status s ON c.idStatus = s.idStatus
            WHERE c.idContrato = ?
        `;
        
        const [result] = await sql.query(query, [idContrato]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contrato',
            error: error.message
        });
        console.error('Erro ao buscar contrato:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarContrato(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            idHospedagem,
            idUsuario,
            idStatus,
            dataInicio,
            dataFim
        } = req.body;

        // Validações básicas
        if (!idHospedagem || !idUsuario || !idStatus || !dataInicio) {
            return res.status(400).json({
                message: 'idHospedagem, idUsuario, idStatus e dataInicio são obrigatórios'
            });
        }

        // Validar datas
        const inicio = new Date(dataInicio);
        const fim = dataFim ? new Date(dataFim) : null;
        
        if (fim && fim < inicio) {
            return res.status(400).json({
                message: 'Data fim não pode ser anterior à data início'
            });
        }

        // Verificar existência das entidades relacionadas
        const [hospedagem] = await sql.query('SELECT idHospedagem FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);
        if (hospedagem.length === 0) {
            return res.status(400).json({ message: 'Hospedagem não encontrada' });
        }

        const [usuario] = await sql.query('SELECT idUsuario FROM Usuario WHERE idUsuario = ?', [idUsuario]);
        if (usuario.length === 0) {
            return res.status(400).json({ message: 'Usuário não encontrado' });
        }

        const [status] = await sql.query('SELECT idStatus FROM Status WHERE idStatus = ?', [idStatus]);
        if (status.length === 0) {
            return res.status(400).json({ message: 'Status não encontrado' });
        }

        // Inserir contrato
        const [result] = await sql.query(
            'INSERT INTO Contrato (idHospedagem, idUsuario, idStatus, dataInicio, dataFim) VALUES (?, ?, ?, ?, ?)',
            [idHospedagem, idUsuario, idStatus, dataInicio, dataFim]
        );

        const novoContrato = {
            idContrato: result.insertId,
            idHospedagem,
            idUsuario,
            idStatus,
            dataInicio,
            dataFim
        };

        res.status(201).json({
            message: 'Contrato criado com sucesso',
            data: novoContrato
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar contrato',
            error: error.message
        });
        console.error('Erro ao criar contrato:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarContrato(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idContrato } = req.params;

        const {
            idHospedagem,
            idUsuario,
            idStatus,
            dataInicio,
            dataFim
        } = req.body;

        // Verificar se o contrato existe
        const [contrato] = await sql.query('SELECT * FROM Contrato WHERE idContrato = ?', [idContrato]);
        if (contrato.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Validar datas se fornecidas
        if (dataInicio && dataFim) {
            const inicio = new Date(dataInicio);
            const fim = new Date(dataFim);
            
            if (fim < inicio) {
                return res.status(400).json({
                    message: 'Data fim não pode ser anterior à data início'
                });
            }
        }

        // Verificar entidades relacionadas se fornecidas
        if (idHospedagem) {
            const [hospedagem] = await sql.query('SELECT idHospedagem FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);
            if (hospedagem.length === 0) {
                return res.status(400).json({ message: 'Hospedagem não encontrada' });
            }
        }

        if (idUsuario) {
            const [usuario] = await sql.query('SELECT idUsuario FROM Usuario WHERE idUsuario = ?', [idUsuario]);
            if (usuario.length === 0) {
                return res.status(400).json({ message: 'Usuário não encontrado' });
            }
        }

        if (idStatus) {
            const [status] = await sql.query('SELECT idStatus FROM Status WHERE idStatus = ?', [idStatus]);
            if (status.length === 0) {
                return res.status(400).json({ message: 'Status não encontrado' });
            }
        }

        // Construir query dinâmica
        const updateFields = {};
        if (idHospedagem !== undefined) updateFields.idHospedagem = idHospedagem;
        if (idUsuario !== undefined) updateFields.idUsuario = idUsuario;
        if (idStatus !== undefined) updateFields.idStatus = idStatus;
        if (dataInicio) updateFields.dataInicio = dataInicio;
        if (dataFim !== undefined) updateFields.dataFim = dataFim;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Contrato SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idContrato = ?';
        values.push(idContrato);

        await sql.query(query, values);

        // Buscar contrato atualizado
        const [updatedContrato] = await sql.query('SELECT * FROM Contrato WHERE idContrato = ?', [idContrato]);

        res.status(200).json({
            message: 'Contrato atualizado com sucesso',
            data: updatedContrato[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar contrato',
            error: error.message
        });
        console.error('Erro ao atualizar contrato:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirContrato(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idContrato } = req.params;

        // Verificar se o contrato existe
        const [contrato] = await sql.query('SELECT * FROM Contrato WHERE idContrato = ?', [idContrato]);
        if (contrato.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        await sql.query('DELETE FROM Contrato WHERE idContrato = ?', [idContrato]);

        res.status(200).json({
            message: 'Contrato excluído com sucesso',
            data: contrato[0]
        });

    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                message: 'Não é possível excluir o contrato pois está sendo utilizado em outros registros'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir contrato',
            error: error.message
        });
        console.error('Erro ao excluir contrato:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerContratos,
    buscarContratoPorId,
    criarContrato,
    atualizarContrato,
    excluirContrato
};