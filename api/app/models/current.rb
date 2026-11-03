# Reset around every request, so one request reads the store settings once.
class Current < ActiveSupport::CurrentAttributes
  attribute :store_setting
end
