const express = require('express')
const Router = express.Router()
const PetsController = require('../controllers/PetController.js')

Router.get('/pets', PetsController.lerPets);
Router.get('/pets/:idPet', PetsController.buscarPetPorId);
Router.get('/usuarios/:idUsuario/pets', PetsController.buscarPetsPorUsuario);
Router.post('/pets', PetsController.criarPet);
Router.put('/pets/:idPet', PetsController.atualizarPet);
Router.delete('/pets/:idPet', PetsController.excluirPet);

module.exports = Router