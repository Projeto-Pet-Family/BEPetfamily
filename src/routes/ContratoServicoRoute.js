const express = require('express')
const Router = express.Router()
const ContratoServicoController = require('../controllers/ContratoServicoController.js')

Router.get('/contratoservico', ContratoServicoController.lerContratosServico)
Router.post('/contratoservico', ContratoServicoController.inserirContratoServico)
Router.put('/contratoservico/:idContratoServico', ContratoServicoController.updateContratoServico)
Router.delete('/contratoservico/:idContratoServico', ContratoServicoController.excluirContratoServico)

module.exports = Router