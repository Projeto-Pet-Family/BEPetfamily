const express = require('express');
const Router = express.Router();
const BairroController = require('../../../controllers/hospedagem/endereco/BairroController.js');

Router.get('/bairros', BairroController.lerBairros);
Router.get('/bairros/:idBairro', BairroController.buscarBairroPorId);
Router.post('/bairros', BairroController.criarBairro);
Router.put('/bairros/:idBairro', BairroController.atualizarBairro);
Router.delete('/bairros/:idBairro', BairroController.excluirBairro);

module.exports = Router;