const express = require('express')
const Router = express.Router()
const ServicosController = require('../controllers/ServicoController.js')

/* Serviços */

Router.get('/servicos', ServicosController.lerServicos)
Router.get('/servicos/:idServico', ServicosController.lerServicoID)
Router.post('/servicos', ServicosController.inserirServico)
Router.delete('/servicos/:idServico', ServicosController.excluirServico)
Router.put('/servicos/:idServico', ServicosController.atualizarServico)

module.exports = Router