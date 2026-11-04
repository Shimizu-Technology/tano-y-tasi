class InventoryMovement < ApplicationRecord
  belongs_to :product
  belongs_to :order, optional: true
  belongs_to :production_run, optional: true
end
