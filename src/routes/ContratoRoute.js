const express = require('express')
const Router = express.Router()
const ContratoController = require('../controllers/ContratoController.js')

Router.get('/contratos', ContratoController.lerContratos)
Router.get('/contratos/:idContrato', ContratoController.lerContratosID)
Router.post('/contratos', ContratoController.inserirContrato)
Router.put('/contratos/:idContrato', ContratoController.updateContrato)
Router.delete('/contratos/:idContrato', ContratoController.excluirContrato)

module.exports = Router