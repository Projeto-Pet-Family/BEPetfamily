const express = require('express')
const Router = express.Router()
const PetController = require('../../controllers/pet/PetController.js')

Router.get('/pet', PetController.lerPet)
Router.get('/pet/:idPet', PetController.lerPetPorId)
Router.post('/pet', PetController.inserirPet)
Router.put('/pet/:idPet', PetController.updatePet)
Router.delete('/pet/:idPet', PetController.deletePet)

module.exports = Router