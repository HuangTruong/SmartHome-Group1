#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

/*========== WIFI ==========*/
const char* ssid = "IOT";
const char* password = "11112222";

/*========== SERVER ==========*/
String server = "http://10.252.216.60:3000";

/*========== PIN ==========*/
#define LDR_PIN A0
#define MQ2_PIN D5
#define DHT_PIN D4

#define LED_PIN D0
#define BUZZER_PIN D3

// L9110 (quạt DC)
#define MOTOR_IN1 D6
#define MOTOR_IN2 D7

#define DHTTYPE DHT11
DHT dht(DHT_PIN, DHTTYPE);

/*========== BIẾN ==========*/
unsigned long lastTime = 0;
const long interval = 1000;

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
    connectWiFi();
  }
}

/*========== ĐỌC CẢM BIẾN ==========*/
void readSensor() {
  light = analogRead(LDR_PIN);

  // FIX MQ2 (digital -> giả lập analog cho server)
  smoke = digitalRead(MQ2_PIN) == LOW ? 1 : 0;

  temp = dht.readTemperature();
  if (isnan(temp)) temp = 0;

  Serial.printf("Temp: %.2f | Light: %d | Smoke: %d\n", temp, light, smoke);
}

/*========== GỬI DATA ==========*/
void sendData() {
  if (WiFi.status() != WL_CONNECTED) return;

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
    Serial.println("POST FAIL");
  }

  http.end();
}

/*========== NHẬN LỆNH ==========*/
void getControl() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;

  http.begin(client, server + "/api/esp/control");
  int httpCode = http.GET();

  if (httpCode > 0) {
    String payload = http.getString();
    Serial.println(payload);

    DynamicJsonDocument doc(256);
    deserializeJson(doc, payload);

    bool lightCmd  = doc["light"];
    bool fanCmd    = doc["fan"];
    bool buzzerCmd = doc["buzzer"];

    // OUTPUT
    digitalWrite(LED_PIN, lightCmd ? HIGH : LOW);
    digitalWrite(BUZZER_PIN, buzzerCmd ? HIGH : LOW);

    controlMotor(fanCmd);

  } else {
    Serial.println("GET FAIL");
  }

  http.end();
}

/*========== MOTOR (L9110) ==========*/
void controlMotor(bool state) {
  if (state) {
    digitalWrite(MOTOR_IN1, HIGH);
    digitalWrite(MOTOR_IN2, LOW);
  } else {
    digitalWrite(MOTOR_IN1, LOW);
    digitalWrite(MOTOR_IN2, LOW);
  }
}

/*========== SETUP ==========*/
void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(MQ2_PIN, INPUT);

  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);

  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  dht.begin();
  connectWiFi();
}

/*========== LOOP ==========*/
void loop() {
  reconnectWiFi();

  if (millis() - lastTime > interval) {
    lastTime = millis();

    readSensor();   // đọc cảm biến
    sendData();     // gửi lên server
    getControl();   // nhận lệnh từ server → xuất ra
  }
}