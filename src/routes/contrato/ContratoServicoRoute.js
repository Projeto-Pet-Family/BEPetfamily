const express = require('express');
const router = express.Router();
const contratoServicoController = require('../../controllers/contrato/ContratoServicoController.js');

router.post('/contratoservico', contratoServicoController.adicionarServicoContrato);
router.put('/contratoservico/:idContratoServico', contratoServicoController.atualizarServicoContrato);
router.delete('/contratoservico/:idContratoServico', contratoServicoController.removerServicoContrato);
router.get('/contratoservico/:idContrato', contratoServicoController.listarServicosContrato);
router.get('/contratoservico', contratoServicoController.lerContratosServico);
router.get('/contratoservico/:idContratoServico', contratoServicoController.buscarContratoServicoPorId);

module.exports = router;