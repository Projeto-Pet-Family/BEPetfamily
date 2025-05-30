const express = require('express')
const Router = express.Router()
const ServicoController = require('../../controllers/hospedagem/ServicoController.js')

Router.get('/servicos', ServicoController.lerServicos);
Router.get('/servicos/:idServico', ServicoController.buscarServicoPorId);
Router.post('/servicos', ServicoController.criarServico);
Router.put('/servicos/:idServico', ServicoController.atualizarServico);
Router.delete('/servicos/:idServico', ServicoController.excluirServico);

module.exports = Router