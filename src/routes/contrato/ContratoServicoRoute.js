const express = require('express');
const Router = express.Router();
const ContratoServicoController = require('../../controllers/contrato/ContratoServicoController.js')

// Rotas CRUD
Router.get('/contratoservico', ContratoServicoController.lerContratosServico);
Router.get('/contratoservico/:idContratoServico', ContratoServicoController.buscarContratoServicoPorId);
Router.post('/contratoservico', ContratoServicoController.inserirContratoServico);
Router.put('/contratoservico/:idContratoServico', ContratoServicoController.atualizarContratoServico);
Router.delete('/contratoservico/:idContratoServico', ContratoServicoController.excluirContratoServico);

module.exports = Router;