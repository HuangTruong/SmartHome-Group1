#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

/*========== WIFI ==========*/
const char* ssid = "YOUR_SSID";
const char* password = "YOUR_PASSWORD";

/*========== SERVER ==========*/
String server = "http://YOUR_IP:3000";

/*========== PIN ==========*/
#define LDR_PIN A0
#define MQ2_PIN D5
#define DHT_PIN D4

#define RELAY_FAN D2
#define RELAY_BUZZER D8

#define LED_PIN D0
#define BUZZER_PIN D3

// L9110 (motor/quạt DC)
#define MOTOR_IN1 D6
#define MOTOR_IN2 D7

#define DHTTYPE DHT11
DHT dht(DHT_PIN, DHTTYPE);

/*========== BIẾN ==========*/
unsigned long lastTime = 0;
const long interval = 800;

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
  smoke = digitalRead(MQ2_PIN);
  temp = dht.readTemperature();

  if (isnan(temp)) temp = 0;

  Serial.printf("Temp: %.2f | Light: %d | Smoke: %d\n", temp, light, smoke);
}

/*========== GỬI DATA ==========*/
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

  Serial.println(httpCode > 0 ? "POST OK" : "POST FAIL");

  http.end();
}

/*========== NHẬN LỆNH ==========*/
void getControl() {
  WiFiClient client;
  HTTPClient http;

  http.begin(client, server + "/api/esp/control");
  int httpCode = http.GET();

  if (httpCode > 0) {
    String payload = http.getString();
    Serial.println(payload);

    DynamicJsonDocument doc(256);
    deserializeJson(doc, payload);

    bool lightCmd = doc["light"];
    bool fanCmd = doc["fan"];
    bool buzzerCmd = doc["buzzer"];
    bool motorCmd = doc["motor"];

    digitalWrite(RELAY_LIGHT, lightCmd ? LOW : HIGH);
    digitalWrite(RELAY_FAN, fanCmd ? LOW : HIGH);
    digitalWrite(BUZZER_PIN, buzzerCmd ? HIGH : LOW);

    controlMotor(motorCmd);

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

/*========== AUTO MODE ==========*/
void autoControl() {

  // Trời tối → bật đèn
  if (light < 300) { // trời tối
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }

  // Nóng → bật quạt relay + motor
  if (temp > 30) {
    digitalWrite(RELAY_FAN, LOW);
    controlMotor(true);
  } else {
    digitalWrite(RELAY_FAN, HIGH);
    controlMotor(false);
  }

  // Có khói → bật buzzer
  if (smoke == HIGH) {
    digitalWrite(RELAY_BUZZER, LOW);
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    digitalWrite(RELAY_BUZZER, HIGH);
    digitalWrite(BUZZER_PIN, LOW);
  }
}

/*========== SETUP ==========*/
void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(MQ2_PIN, INPUT);

  pinMode(RELAY_FAN, OUTPUT);
  pinMode(RELAY_BUZZER, OUTPUT);

  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);

  // Relay OFF (Active LOW)
  digitalWrite(RELAY_FAN, HIGH);
  digitalWrite(RELAY_BUZZER, HIGH);

  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  dht.begin();
  //connectWiFi();
}

/*========== LOOP ==========*/
void loop() {
  //reconnectWiFi();

  if (millis() - lastTime > interval) {
    lastTime = millis();

    readSensor();
    //sendData();
    //getControl();
    autoControl();
  }
}