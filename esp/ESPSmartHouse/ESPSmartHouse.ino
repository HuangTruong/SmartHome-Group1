#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

/*========== WIFI ==========*/
const char* ssid = "YOUR_WIFI";
const char* password = "YOUR_PASS";

/*========== SERVER ==========*/
String server = "http://YOUR_IP:3000";

/*========== PIN ==========*/
#define LDR_PIN A0
#define MQ2_PIN D5      // dùng digital
#define DHT_PIN D4
#define RELAY_LIGHT D1
#define RELAY_FAN D2
#define LED_PIN D0

#define DHTTYPE DHT11
DHT dht(DHT_PIN, DHTTYPE);

/*========== BIEN ==========*/
unsigned long lastTime = 0;
const long interval = 3000;

float temp = 0;
int light = 0;
int smoke = 0;

/*========== WIFI ==========*/
void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");
}

void reconnectWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Reconnecting WiFi...");
    connectWiFi();
  }
}

/*========== DOC CAM BIEN ==========*/
void readSensor() {
  light = analogRead(LDR_PIN);
  smoke = digitalRead(MQ2_PIN);
  temp = dht.readTemperature();

  if (isnan(temp)) temp = 0;

  Serial.printf("Temp: %.2f | Light: %d | Smoke: %d\n", temp, light, smoke);
}

/*========== GUI DATA ==========*/
void sendData() {
  WiFiClient client;
  HTTPClient http;

  http.begin(client, server + "/api/esp/data");
  http.addHeader("Content-Type", "application/json");

  DynamicJsonDocument doc(256);
  doc["temperature"] = temp;
  doc["light"] = light;
  doc["smoke"] = smoke;

  String json;
  serializeJson(doc, json);

  int httpCode = http.POST(json);

  if (httpCode > 0) {
    Serial.println("POST OK");
  } else {
    Serial.println("POST Failed");
  }

  http.end();
}

/*========== NHAN LENH ==========*/
void getControl() {
  WiFiClient client;
  HTTPClient http;

  http.begin(client, server + "/api/esp/control");
  int httpCode = http.GET();

  if (httpCode > 0) {
    String payload = http.getString();
    Serial.println("Control: " + payload);

    DynamicJsonDocument doc(256);
    deserializeJson(doc, payload);

    bool lightCmd = doc["light"];
    bool fanCmd = doc["fan"];
    bool buzzerCmd = doc["buzzer"];

    // Điều khiển relay (LOW = ON)
    digitalWrite(RELAY_LIGHT, lightCmd ? LOW : HIGH);
    digitalWrite(RELAY_FAN, fanCmd ? LOW : HIGH);
    digitalWrite(LED_PIN, buzzerCmd ? HIGH : LOW);

  } else {
    Serial.println("GET Failed");
  }

  http.end();
}

/*========== AUTO MODE ==========*/
void autoControl() {
  // Tự bật đèn nếu tối
  if (light < 300) {
    digitalWrite(RELAY_LIGHT, LOW);
  }

  // Tự bật quạt nếu nóng
  if (temp > 30) {
    digitalWrite(RELAY_FAN, LOW);
  }

  // Cảnh báo khói
  if (smoke == HIGH) {
    digitalWrite(LED_PIN, HIGH);
  }
}

/*========== SETUP ==========*/
void setup() {
  Serial.begin(115200);

  pinMode(RELAY_LIGHT, OUTPUT);
  pinMode(RELAY_FAN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(MQ2_PIN, INPUT);

  digitalWrite(RELAY_LIGHT, HIGH);
  digitalWrite(RELAY_FAN, HIGH);
  digitalWrite(LED_PIN, LOW);

  dht.begin();

  connectWiFi();
}

/*========== LOOP ==========*/
void loop() {
  reconnectWiFi();

  if (millis() - lastTime > interval) {
    lastTime = millis();

    readSensor();
    sendData();
    getControl();
    autoControl();
  }
}