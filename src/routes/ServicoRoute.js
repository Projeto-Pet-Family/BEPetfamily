const express = require('express')
const Router = express.Router()
const ServicosController = require('../controllers/ServicoController.js')

Router.get('/servicos', ServicosController.lerServicos);
Router.get('/servicos/:idServico', ServicosController.buscarServicoPorId);
Router.post('/servicos', ServicosController.criarServico);
Router.put('/servicos/:idServico', ServicosController.atualizarServico);
Router.delete('/servicos/:idServico', ServicosController.excluirServico);

module.exports = Router