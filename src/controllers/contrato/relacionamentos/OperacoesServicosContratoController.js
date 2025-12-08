const pool = require('../../../connections/SQLConnections.js');
/* const { buscarContratoComRelacionamentos, statusNaoEditaveis, statusMap } = require('../ContratoController'); */
const { 
    buscarContratoComRelacionamentos, 
    validarStatus, 
    validarDatas, 
    construirQueryUpdate, 
    statusNaoEditaveis, 
    statusMap 
} = require('../ContratoUtils.js');

const adicionarServicoContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const { idContrato } = req.params;
        const { servicosPorPet } = req.body;

        // Validação básica
        if (!servicosPorPet || !Array.isArray(servicosPorPet) || servicosPorPet.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                message: 'Lista de serviços por pet é obrigatória e deve ser um array não vazio' 
            });
        }

        // Validar formato para cada item
        const formatoValido = servicosPorPet.every(item => 
            item.idPet && 
            item.servicos && 
            Array.isArray(item.servicos) && 
            item.servicos.length > 0
        );

        if (!formatoValido) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                message: 'Formato inválido. Cada item deve ter: {idPet: number, servicos: [idServico, ...]}' 
            });
        }

        // Verificar duplicidade de pets na requisição
        const petsIds = servicosPorPet.map(item => item.idPet);
        const petsUnicos = [...new Set(petsIds)];
        if (petsUnicos.length !== servicosPorPet.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                message: 'Não é permitido adicionar serviços para o mesmo pet múltiplas vezes na mesma requisição' 
            });
        }

        // Buscar contrato e validar status
        const contrato = await client.query(
            'SELECT c.*, h.idhospedagem FROM contrato c JOIN hospedagem h ON c.idhospedagem = h.idhospedagem WHERE c.idcontrato = $1',
            [idContrato]
        );
        
        if (contrato.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                message: 'Contrato não encontrado' 
            });
        }

        const contratoData = contrato.rows[0];
        
        if (statusNaoEditaveis.includes(contratoData.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                message: `Não é possível adicionar serviços a um contrato com status "${statusMap[contratoData.status]}"`
            });
        }

        // Verificar se os pets pertencem ao contrato
        const contratoPets = await client.query(
            'SELECT idpet FROM contrato_pet WHERE idcontrato = $1 AND idpet = ANY($2)',
            [idContrato, petsIds]
        );

        if (contratoPets.rows.length !== petsIds.length) {
            await client.query('ROLLBACK');
            const petsValidosIds = contratoPets.rows.map(p => p.idpet);
            const petsInvalidos = petsIds.filter(id => !petsValidosIds.includes(id));
            
            return res.status(400).json({ 
                success: false,
                message: 'Um ou mais pets não pertencem a este contrato',
                petsInvalidos: petsInvalidos
            });
        }

        // Coletar todos os IDs de serviços
        const todosServicosIds = servicosPorPet.flatMap(item => item.servicos);
        const servicosUnicos = [...new Set(todosServicosIds)];
        
        // Validar serviços duplicados para cada pet
        for (const item of servicosPorPet) {
            const servicosDoPet = [...new Set(item.servicos)];
            if (servicosDoPet.length !== item.servicos.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false,
                    message: `Não é permitido adicionar o mesmo serviço múltiplas vezes para o pet ${item.idPet}` 
                });
            }
        }

        // Verificar se serviços já existem para cada pet
        for (const item of servicosPorPet) {
            const servicosExistentes = await client.query(
                `SELECT cs.idservico 
                 FROM contratoservico cs 
                 WHERE cs.idcontrato = $1 
                 AND cs.idservico = ANY($2) 
                 AND cs.idpet = $3`,
                [idContrato, item.servicos, item.idPet]
            );

            if (servicosExistentes.rows.length > 0) {
                await client.query('ROLLBACK');
                const servicosExistentesIds = servicosExistentes.rows.map(s => s.idservico);
                return res.status(400).json({ 
                    success: false,
                    message: `Um ou mais serviços já estão vinculados a este contrato para o pet ${item.idPet}`,
                    pet: item.idPet,
                    servicosExistentes: servicosExistentesIds
                });
            }
        }

        // Verificar se serviços estão disponíveis na hospedagem
        const servicosValidos = await client.query(
            'SELECT idservico, descricao, preco FROM servico WHERE idservico = ANY($1) AND idhospedagem = $2 AND ativo = true',
            [servicosUnicos, contratoData.idhospedagem]
        );

        if (servicosValidos.rows.length !== servicosUnicos.length) {
            await client.query('ROLLBACK');
            const servicosValidosIds = servicosValidos.rows.map(s => s.idservico);
            const servicosInvalidos = servicosUnicos.filter(id => !servicosValidosIds.includes(id));
            
            return res.status(400).json({ 
                success: false,
                message: 'Um ou mais serviços não estão disponíveis para esta hospedagem',
                servicosInvalidos: servicosInvalidos
            });
        }

        // Preparar para inserir múltiplos serviços
        const servicosInseridos = [];
        const valoresInsercao = [];
        const placeholders = [];
        
        let placeholderIndex = 1;
        for (const item of servicosPorPet) {
            for (const idServico of item.servicos) {
                const servicoInfo = servicosValidos.rows.find(s => s.idservico === idServico);
                valoresInsercao.push(idContrato, idServico, item.idPet, 1, servicoInfo.preco);
                placeholders.push(`($${placeholderIndex}, $${placeholderIndex + 1}, $${placeholderIndex + 2}, $${placeholderIndex + 3}, $${placeholderIndex + 4})`);
                placeholderIndex += 5;
                
                servicosInseridos.push({
                    idServico,
                    idPet: item.idPet,
                    descricao: servicoInfo.descricao,
                    quantidade: 1,
                    precoUnitario: servicoInfo.preco,
                    precoTotal: servicoInfo.preco
                });
            }
        }

        // Inserir todos os serviços de uma vez
        if (valoresInsercao.length > 0) {
            await client.query(
                `INSERT INTO contratoservico 
                 (idcontrato, idservico, idpet, quantidade, preco_unitario) 
                 VALUES ${placeholders.join(', ')}`,
                valoresInsercao
            );
        }

        await client.query('COMMIT');

        // Buscar contrato atualizado
        const contratoCompleto = await buscarContratoComRelacionamentos(idContrato);
        
        // Calcular valor total adicional
        const valorServicosAdicional = servicosInseridos.reduce((sum, s) => sum + s.precoTotal, 0);
        
        // Agrupar serviços por pet para resposta
        const servicosPorPetAgrupados = {};
        servicosInseridos.forEach(servico => {
            if (!servicosPorPetAgrupados[servico.idPet]) {
                servicosPorPetAgrupados[servico.idPet] = {
                    idPet: servico.idPet,
                    servicos: []
                };
            }
            servicosPorPetAgrupados[servico.idPet].servicos.push({
                idServico: servico.idServico,
                descricao: servico.descricao,
                quantidade: servico.quantidade,
                precoUnitario: servico.precoUnitario,
                precoTotal: servico.precoTotal
            });
        });

        res.status(200).json({
            success: true,
            message: 'Serviço(s) adicionado(s) com sucesso',
            servicosAdicionados: Object.values(servicosPorPetAgrupados),
            resumo: {
                totalServicosAdicionados: servicosInseridos.length,
                totalPetsAfetados: Object.keys(servicosPorPetAgrupados).length,
                valorTotalAdicionado: valorServicosAdicional
            },
            data: contratoCompleto
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Erro ao adicionar serviço ao contrato:', error);
        res.status(500).json({ 
            success: false,
            message: 'Erro ao adicionar serviço ao contrato', 
            error: error.message 
        });
    } finally { 
        if (client) client.release(); 
    }
};

const excluirServicoContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        
        const { idContrato } = req.params;
        const { servicosPorPet } = req.body; // Mesmo formato do adicionar: [{idPet: X, servicos: [Y, Z, ...]}, ...]

        // Validação básica
        if (!servicosPorPet || !Array.isArray(servicosPorPet) || servicosPorPet.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                message: 'Lista de serviços por pet é obrigatória e deve ser um array não vazio' 
            });
        }

        // Validar formato para cada item
        const formatoValido = servicosPorPet.every(item => 
            item.idPet && 
            item.servicos && 
            Array.isArray(item.servicos) && 
            item.servicos.length > 0
        );

        if (!formatoValido) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                message: 'Formato inválido. Cada item deve ter: {idPet: number, servicos: [idServico, ...]}' 
            });
        }

        // Verificar duplicidade de pets na requisição
        const petsIds = servicosPorPet.map(item => item.idPet);
        const petsUnicos = [...new Set(petsIds)];
        if (petsUnicos.length !== servicosPorPet.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                message: 'Não é permitido excluir serviços para o mesmo pet múltiplas vezes na mesma requisição' 
            });
        }

        // Buscar contrato e validar status
        const contrato = await client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]);
        
        if (contrato.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                message: 'Contrato não encontrado' 
            });
        }

        const contratoData = contrato.rows[0];
        
        if (statusNaoEditaveis.includes(contratoData.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                message: `Não é possível remover serviços de um contrato com status "${statusMap[contratoData.status]}"`
            });
        }

        // Verificar existência dos serviços e coletar dados para exclusão
        const servicosExcluidos = [];
        const servicosNaoEncontrados = [];
        
        for (const item of servicosPorPet) {
            const { idPet, servicos: servicosIds } = item;
            
            // Validar serviços duplicados na requisição para este pet
            const servicosUnicos = [...new Set(servicosIds)];
            if (servicosUnicos.length !== servicosIds.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false,
                    message: `Não é permitido tentar excluir o mesmo serviço múltiplas vezes para o pet ${idPet}` 
                });
            }
            
            // Verificar cada serviço deste pet
            for (const idServico of servicosIds) {
                const servicoExistente = await client.query(
                    `SELECT cs.*, s.descricao, p.nome as pet_nome 
                     FROM contratoservico cs 
                     JOIN servico s ON cs.idservico = s.idservico
                     LEFT JOIN pet p ON cs.idpet = p.idpet
                     WHERE cs.idcontrato = $1 
                     AND cs.idservico = $2 
                     AND cs.idpet = $3`,
                    [idContrato, idServico, idPet]
                );

                if (servicoExistente.rows.length === 0) {
                    servicosNaoEncontrados.push({
                        idPet,
                        idServico
                    });
                } else {
                    servicosExcluidos.push({
                        ...servicoExistente.rows[0],
                        precoTotal: servicoExistente.rows[0].quantidade * servicoExistente.rows[0].preco_unitario
                    });
                }
            }
        }

        // Se algum serviço não foi encontrado
        if (servicosNaoEncontrados.length > 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                message: 'Alguns serviços não foram encontrados',
                servicosNaoEncontrados: servicosNaoEncontrados,
                detalhes: 'Verifique se os serviços estão vinculados aos pets especificados'
            });
        }

        // Excluir todos os serviços
        for (const item of servicosPorPet) {
            const { idPet, servicos: servicosIds } = item;
            
            if (servicosIds.length > 0) {
                await client.query(
                    `DELETE FROM contratoservico 
                     WHERE idcontrato = $1 
                     AND idpet = $2 
                     AND idservico = ANY($3)`,
                    [idContrato, idPet, servicosIds]
                );
            }
        }

        await client.query('COMMIT');

        // Buscar contrato atualizado
        const contratoCompleto = await buscarContratoComRelacionamentos(idContrato);
        
        // Calcular valor total removido
        const valorTotalRemovido = servicosExcluidos.reduce((sum, s) => sum + s.precoTotal, 0);
        
        // Agrupar serviços excluídos por pet
        const servicosPorPetAgrupados = {};
        servicosExcluidos.forEach(servico => {
            if (!servicosPorPetAgrupados[servico.idpet]) {
                servicosPorPetAgrupados[servico.idpet] = {
                    idPet: servico.idpet,
                    petNome: servico.pet_nome,
                    servicos: []
                };
            }
            servicosPorPetAgrupados[servico.idpet].servicos.push({
                idServico: servico.idservico,
                descricao: servico.descricao,
                quantidade: servico.quantidade,
                precoUnitario: servico.preco_unitario,
                precoTotal: servico.precoTotal
            });
        });

        res.status(200).json({
            success: true,
            message: 'Serviço(s) removido(s) do contrato com sucesso',
            servicosExcluidos: Object.values(servicosPorPetAgrupados),
            resumo: {
                totalServicosRemovidos: servicosExcluidos.length,
                totalPetsAfetados: Object.keys(servicosPorPetAgrupados).length,
                valorTotalRemovido: valorTotalRemovido,
                valorTotalAtualizado: contratoCompleto.calculo_valores?.valor_total_contrato || 0
            },
            data: contratoCompleto
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Erro ao excluir serviço do contrato:', error);
        
        const statusCode = error.code === '23503' ? 400 : 500;
        const message = error.code === '23503' 
            ? 'Não é possível excluir o serviço pois está vinculado a outros registros'
            : 'Erro ao excluir serviço do contrato';
        
        res.status(statusCode).json({ 
            success: false,
            message, 
            error: error.message 
        });
    } finally { 
        if (client) client.release(); 
    }
};

const lerServicosExistentesContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // 1. Buscar informações básicas do contrato
        const contratoQuery = `
            SELECT 
                c.idcontrato,
                c.idhospedagem,
                c.idusuario,
                c.datainicio,
                c.datafim,
                c.status,
                h.nome as hospedagem_nome,
                h.valor_diaria
            FROM contrato c
            JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            WHERE c.idcontrato = $1
        `;

        const contratoResult = await client.query(contratoQuery, [idContrato]);

        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Contrato não encontrado',
                error: 'CONTRATO_NAO_ENCONTRADO'
            });
        }

        const contrato = contratoResult.rows[0];
        const idHospedagem = contrato.idhospedagem;

        // 2. Buscar todos os pets do contrato
        const petsQuery = `
            SELECT 
                p.idpet,
                p.nome as pet_nome,
                p.sexo,
                p.nascimento,
                port.descricao as porte,
                rac.descricao as raca,
                esp.descricao as especie
            FROM contrato_pet cp
            JOIN pet p ON cp.idpet = p.idpet
            LEFT JOIN porte port ON p.idporte = port.idporte
            LEFT JOIN raca rac ON p.idraca = rac.idraca
            LEFT JOIN especie esp ON p.idespecie = esp.idespecie
            WHERE cp.idcontrato = $1
            ORDER BY p.nome
        `;
        
        const petsResult = await client.query(petsQuery, [idContrato]);
        const pets = petsResult.rows;

        // 3. Buscar todos os serviços do contrato com pet info
        const servicosQuery = `
            SELECT 
                cs.idservico,
                cs.idpet,
                cs.quantidade,
                cs.preco_unitario,
                (cs.quantidade * cs.preco_unitario) as preco_total,
                s.descricao,
                s.preco as preco_atual,
                s.ativo,
                s.duracao,
                p.nome as pet_nome,
                port.descricao as pet_porte,
                rac.descricao as pet_raca,
                esp.descricao as pet_especie
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            LEFT JOIN pet p ON cs.idpet = p.idpet
            LEFT JOIN porte port ON p.idporte = port.idporte
            LEFT JOIN raca rac ON p.idraca = rac.idraca
            LEFT JOIN especie esp ON p.idespecie = esp.idespecie
            WHERE cs.idcontrato = $1
            ORDER BY 
                CASE WHEN cs.idpet IS NULL THEN 0 ELSE 1 END,
                p.nome,
                s.descricao
        `;

        const servicosResult = await client.query(servicosQuery, [idContrato]);
        const todosServicosContrato = servicosResult.rows;

        // 4. Buscar todos os serviços disponíveis na hospedagem
        const servicosDisponiveisQuery = `
            SELECT 
                s.idservico,
                s.descricao,
                s.preco,
                s.ativo,
                s.duracao
            FROM servico s
            WHERE s.idhospedagem = $1
            ORDER BY s.descricao
        `;

        const servicosDisponiveisResult = await client.query(servicosDisponiveisQuery, [idHospedagem]);
        const servicosDisponiveis = servicosDisponiveisResult.rows;

        // 5. Organizar os dados
        const servicosGerais = [];
        const petsMap = {};

        // Inicializar mapa de pets
        for (const pet of pets) {
            petsMap[pet.idpet] = {
                idPet: pet.idpet,
                nome: pet.pet_nome,
                sexo: pet.sexo,
                nascimento: pet.nascimento,
                porte: pet.porte,
                raca: pet.raca,
                especie: pet.especie,
                servicos: []
            };
        }

        // Processar cada serviço
        for (const servico of todosServicosContrato) {
            const precoUnitario = parseFloat(servico.preco_unitario || 0);
            const quantidade = servico.quantidade || 1;
            const precoTotal = parseFloat(servico.preco_total || precoUnitario * quantidade);
            
            const servicoFormatado = {
                idservico: servico.idservico,
                descricao: servico.descricao,
                quantidade: quantidade,
                precoUnitario: precoUnitario,
                precoTotal: precoTotal,
                precoAtual: parseFloat(servico.preco_atual || 0),
                ativo: servico.ativo,
                duracao: servico.duracao,
                idpet: servico.idpet,
                petNome: servico.pet_nome,
                petPorte: servico.pet_porte,
                petRaca: servico.pet_raca,
                petEspecie: servico.pet_especie
            };

            if (servico.idpet && petsMap[servico.idpet]) {
                petsMap[servico.idpet].servicos.push(servicoFormatado);
            } else {
                servicosGerais.push(servicoFormatado);
            }
        }

        // 6. Preparar lista de pets com serviços
        const petsComServicos = [];
        let totalValorServicosPets = 0;
        let totalServicosPets = 0;

        for (const petId in petsMap) {
            const pet = petsMap[petId];
            const valorTotalPet = pet.servicos.reduce(
                (sum, s) => sum + s.precoTotal, 0
            );
            
            totalValorServicosPets += valorTotalPet;
            totalServicosPets += pet.servicos.length;

            petsComServicos.push({
                idPet: pet.idPet,
                nome: pet.nome,
                sexo: pet.sexo,
                nascimento: pet.nascimento,
                porte: pet.porte,
                raca: pet.raca,
                especie: pet.especie,
                servicosAdicionados: pet.servicos.length,
                valorTotalServicos: valorTotalPet,
                servicos: pet.servicos
            });
        }

        // 7. Calcular totais
        const valorTotalServicosGerais = servicosGerais.reduce(
            (sum, s) => sum + s.precoTotal, 0
        );

        const totalServicosAdicionados = servicosGerais.length + totalServicosPets;
        const valorTotalServicos = valorTotalServicosGerais + totalValorServicosPets;

        // 8. Preparar lista completa de todos os serviços
        const todosServicos = [...servicosGerais];
        for (const pet of petsComServicos) {
            todosServicos.push(...pet.servicos);
        }

        // 9. Preparar resposta
        res.status(200).json({
            success: true,
            message: 'Serviços do contrato recuperados com sucesso',
            data: {
                contrato: {
                    idContrato: contrato.idcontrato,
                    idHospedagem: contrato.idhospedagem,
                    idUsuario: contrato.idusuario,
                    dataInicio: contrato.datainicio,
                    dataFim: contrato.datafim,
                    status: contrato.status,
                    hospedagemNome: contrato.hospedagem_nome,
                    valorDiaria: parseFloat(contrato.valor_diaria || 0)
                },
                pets: petsComServicos,
                servicos: {
                    gerais: servicosGerais,
                    todos: todosServicos
                },
                servicosDisponiveis: servicosDisponiveis.map(s => ({
                    idservico: s.idservico,
                    descricao: s.descricao,
                    preco: parseFloat(s.preco || 0),
                    ativo: s.ativo,
                    duracao: s.duracao
                })),
                resumo: {
                    totalPets: pets.length,
                    totalServicosDisponiveis: servicosDisponiveis.length,
                    totalServicosAdicionados: totalServicosAdicionados,
                    totalServicosGerais: servicosGerais.length,
                    totalServicosPets: totalServicosPets,
                    valorTotalServicos: valorTotalServicos,
                    valorServicosGerais: valorTotalServicosGerais,
                    valorServicosPets: totalValorServicosPets
                }
            }
        });

    } catch (error) {
        console.error('Erro ao ler serviços do contrato:', error);
        res.status(500).json({ 
            success: false,
            message: 'Erro ao listar serviços do contrato', 
            error: error.message,
            errorCode: error.code 
        });
    } finally {
        if (client) await client.release();
    }
};
const listarServicosDoPetNoContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idPet } = req.params;

        const petContrato = await client.query(
            `SELECT cp.*, p.nome as pet_nome 
             FROM contrato_pet cp 
             JOIN pet p ON cp.idpet = p.idpet 
             WHERE cp.idcontrato = $1 AND cp.idpet = $2`,
            [idContrato, idPet]
        );

        if (petContrato.rows.length === 0) {
            return res.status(404).json({ 
                message: 'Pet não encontrado neste contrato',
                error: 'PET_NAO_ENCONTRADO'
            });
        }

        const servicosQuery = `
            SELECT 
                cs.*,
                s.descricao,
                s.preco as preco_atual,
                (cs.quantidade * cs.preco_unitario) as subtotal
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            WHERE cs.idcontrato = $1 AND cs.idpet = $2
            ORDER BY s.descricao
        `;

        const servicosResult = await client.query(servicosQuery, [idContrato, idPet]);
        
        const totalServicosPet = servicosResult.rows.reduce((total, servico) => 
            total + (parseFloat(servico.subtotal) || 0), 0
        );

        res.status(200).json({
            message: 'Serviços do pet no contrato listados com sucesso',
            data: {
                pet: {
                    idPet: idPet,
                    nome: petContrato.rows[0].pet_nome
                },
                contrato: {
                    id: idContrato
                },
                servicos: servicosResult.rows.map(servico => ({
                    idServico: servico.idservico,
                    descricao: servico.descricao,
                    quantidade: servico.quantidade,
                    precoUnitario: servico.preco_unitario,
                    precoAtual: servico.preco_atual,
                    subtotal: servico.subtotal
                })),
                resumo: {
                    quantidadeServicos: servicosResult.rows.length,
                    valorTotalServicos: totalServicosPet
                }
            }
        });

    } catch (error) {
        console.error('Erro ao listar serviços do pet:', error);
        res.status(500).json({ 
            message: 'Erro ao listar serviços do pet no contrato', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

const atualizarQuantidadeServicoPet = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idServico, idPet } = req.params;
        const { quantidade } = req.body;

        if (!quantidade || quantidade < 1) {
            return res.status(400).json({ 
                message: 'Quantidade é obrigatória e deve ser maior que zero' 
            });
        }

        const servicoExistente = await client.query(
            `SELECT cs.* FROM contratoservico cs 
             WHERE cs.idcontrato = $1 AND cs.idservico = $2 AND cs.idpet = $3`,
            [idContrato, idServico, idPet]
        );

        if (servicoExistente.rows.length === 0) {
            return res.status(404).json({ 
                message: 'Serviço não encontrado para este pet no contrato' 
            });
        }

        const contrato = await client.query('SELECT status FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (statusNaoEditaveis.includes(contrato.rows[0].status)) {
            return res.status(400).json({ 
                message: `Não é possível atualizar serviços de um contrato com status "${statusMap[contrato.rows[0].status]}"`
            });
        }

        const updateResult = await client.query(
            `UPDATE contratoservico 
             SET quantidade = $1, dataatualizacao = CURRENT_TIMESTAMP 
             WHERE idcontrato = $2 AND idservico = $3 AND idpet = $4 
             RETURNING *`,
            [quantidade, idContrato, idServico, idPet]
        );

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Quantidade do serviço atualizada com sucesso',
            servicoAtualizado: updateResult.rows[0],
            data: contratoCompleto,
            impacto: {
                quantidadeAnterior: servicoExistente.rows[0].quantidade,
                quantidadeNova: quantidade,
                diferencaValor: (quantidade - servicoExistente.rows[0].quantidade) * servicoExistente.rows[0].preco_unitario
            }
        });

    } catch (error) {
        console.error('Erro ao atualizar quantidade do serviço:', error);
        res.status(500).json({ 
            message: 'Erro ao atualizar quantidade do serviço', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

module.exports = {
    adicionarServicoContrato,
    excluirServicoContrato,
    lerServicosExistentesContrato,
    listarServicosDoPetNoContrato,
    atualizarQuantidadeServicoPet
};