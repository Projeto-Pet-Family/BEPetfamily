const express = require('express');
const router = express.Router();
const contratoServicoController = require('../../controllers/contrato/ContratoServicoController.js');

// POST /api/contrato-servico - Adicionar serviço a um contrato
router.post('/contratoservico', contratoServicoController.adicionarServicoContrato);

// PUT /api/contrato-servico/:idContratoServico - Atualizar serviço do contrato
router.put('/contratoservico/:idContratoServico', contratoServicoController.atualizarServicoContrato);

// DELETE /api/contrato-servico/:idContratoServico - Remover serviço do contrato
router.delete('/contratoservico/:idContratoServico', contratoServicoController.removerServicoContrato);

// GET /api/contrato-servico/contrato/:idContrato - Listar serviços de um contrato
router.get('/contratoservico/:idContrato', contratoServicoController.listarServicosContrato);

// GET /api/contrato-servico - Listar todos os contratos serviços (método antigo)
router.get('/contratoservico', contratoServicoController.lerContratosServico);

// GET /api/contrato-servico/:idContratoServico - Buscar contrato serviço por ID (método antigo)
router.get('/contratoservico/:idContratoServico', contratoServicoController.buscarContratoServicoPorId);

module.exports = router;