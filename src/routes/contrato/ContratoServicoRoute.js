const express = require('express');
const router = express.Router();
const contratoServicoController = require('../../controllers/contrato/ContratoServicoController');  

router.post('/', contratoServicoController.adicionarServicoContrato);
router.put('/:idContratoServico', contratoServicoController.atualizarServicoContrato);
router.delete('/:idContratoServico', contratoServicoController.removerServicoContrato);
router.get('/contrato/:idContrato', contratoServicoController.listarServicosContrato);

module.exports = router;