# @license
# SPDX-License-Identifier: Apache-2.0
require 'sinatra'
require 'json'
require 'net/http'
require 'uri'

set :port, 4567
set :bind, '0.0.0.0'

# Enable CORS
before do
  content_type :json
  headers 'Access-Control-Allow-Origin'  => '*',
          'Access-Control-Allow-Methods' => ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          'Access-Control-Allow-Headers' => 'Content-Type'
end

options "*" do
  response.headers["Access-Control-Allow-Headers"] = "coep, coop, cross-origin-embedder-policy, cross-origin-opener-policy, Content-Type, Authorization, X-Requested-With"
  response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
  response.headers["Access-Control-Allow-Origin"] = "*"
  status 200
end

# Load mock database helper
def read_db
  db_path = File.join(Dir.pwd, '..', 'db.json')
  db_path = File.join(Dir.pwd, 'db.json') unless File.exist?(db_path)
  
  if File.exist?(db_path)
    JSON.parse(File.read(db_path))
  else
    { "customers" => [], "properties" => [], "posts" => [], "inbox" => [], "automations" => [] }
  end
end

def write_db(data)
  db_path = File.join(Dir.pwd, '..', 'db.json')
  db_path = File.join(Dir.pwd, 'db.json') unless File.exist?(db_path)
  File.write(db_path, JSON.pretty_generate(data))
end

# 1. GET /api/dashboard
get '/api/dashboard' do
  db = read_db
  total_customers = db['customers'].length
  hot = db['customers'].count { |c| c['status'] == 'hot' }
  warm = db['customers'].count { |c| c['status'] == 'warm' }
  cold = db['customers'].count { |c| c['status'] == 'new' }
  
  {
    status: 'success',
    data: {
      stats: {
        totalCustomers: total_customers,
        leads: { hot: hot, warm: warm, cold: cold },
        totalProperties: db['properties'].length,
        totalPosts: db['posts'].length,
        pendingInbox: db['inbox'].count { |i| i['status'] == 'pending' }
      }
    }
  }.to_json
end

# 2. Customers API CRUD
get '/api/customers' do
  { status: 'success', data: read_db['customers'] }.to_json
end

post '/api/customers' do
  db = read_db
  customer_data = JSON.parse(request.body.read)
  
  new_cust = {
    'id' => "c-#{Time.now.to_i}",
    'name' => customer_data['name'] || 'Khách hàng',
    'phone' => customer_data['phone'] || '',
    'email' => customer_data['email'] || '',
    'source' => customer_data['source'] || 'website',
    'budget' => customer_data['budget'].to_f || 0,
    'interested_area' => customer_data['interested_area'] || 'Đà Nẵng',
    'property_type' => customer_data['property_type'] || 'đất nền',
    'status' => customer_data['status'] || 'new',
    'notes' => customer_data['notes'] || '',
    'ai_summary' => 'Chưa phân tích',
    'lead_score' => 50,
    'created_at' => Time.now.iso8601
  }
  
  db['customers'] << new_cust
  write_db(db)
  { status: 'success', data: new_cust }.to_json
end

# 3. Properties API CRUD
get '/api/properties' do
  { status: 'success', data: read_db['properties'] }.to_json
end

post '/api/properties' do
  db = read_db
  prop_data = JSON.parse(request.body.read)
  
  new_prop = {
    'id' => "p-#{Time.now.to_i}",
    'title' => prop_data['title'],
    'type' => prop_data['type'] || 'đất',
    'location' => prop_data['location'],
    'area' => prop_data['area'].to_f,
    'price' => prop_data['price'].to_f,
    'legal_status' => prop_data['legal_status'] || 'Sổ hồng riêng',
    'direction' => prop_data['direction'] || 'Đông',
    'road_width' => prop_data['road_width'].to_f,
    'description' => prop_data['description'],
    'images' => prop_data['images'] || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
    'selling_points' => prop_data['selling_points'] || ['Vị trí vàng']
  }
  
  db['properties'] << new_prop
  write_db(db)
  { status: 'success', data: new_prop }.to_json
end

# 4. Posts API CRUD
get '/api/posts' do
  { status: 'success', data: read_db['posts'] }.to_json
end

# 5. Inbox Endpoints
get '/api/inbox' do
  { status: 'success', data: read_db['inbox'] }.to_json
end

# 6. Ollama Integration / Chatbot
post '/api/ai/chat' do
  request_payload = JSON.parse(request.body.read)
  message = request_payload['message']
  
  # Connect to local Ollama API
  begin
    uri = URI('http://localhost:11434/api/chat')
    http = Net::HTTP.new(uri.host, uri.port)
    http.read_timeout = 60
    
    payload = {
      model: "qwen2.5",
      messages: [
        { role: "system", content: "Bạn là trưởng phòng tư vấn bất động sản chuyên nghiệp tại Đà Nẵng, Việt Ngữ." },
        { role: "user", content: message }
      ],
      stream: false
    }
    
    req = Net::HTTP::Post.new(uri.path, { 'Content-Type' => 'application/json' })
    req.body = payload.to_json
    res = http.request(req)
    
    if res.code == "200"
      result = JSON.parse(res.body)
      { status: 'success', data: result['message']['content'] }.to_json
    else
      { status: 'error', message: "Ollama status block #{res.code}" }.to_json
    end
  rescue => e
    # Fallback to smart simulated reply
    { 
      status: 'success', 
      data: "Hệ thống AI Agent (Simulated Ruby Sinatra): Rất vui được hỗ trợ quý khách. Trục chính Hòa Xuân, Võ Chí Công và ven sông Cổ Cò đang có biên độ lợi nhuận cực hấp dẫn từ 12-15%/năm!" 
    }.to_json
  end
end

puts "========================================================="
puts " Ruby Sinatra server running on http://localhost:4567"
puts "========================================================="
