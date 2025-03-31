import csv
import click
from faker import Faker
import random
import uuid
import re

fake = Faker(['en_US', 'ko_KR', 'ja_JP', 'es_ES', 'fr_FR'])
Faker.seed(42)

TAGS_POOL = ["premium", "vip", "new-customer", "churned", "b2b", "internal"]
METADATA_KEYS = ["referrer", "region", "plan", "source"]


def generate_tags():
    return ",".join(random.sample(TAGS_POOL, random.randint(0, 3)))


def generate_metadata():
    return {
        "referrer": fake.domain_name(),
        "region": fake.country_code(),
        "plan": random.choice(["free", "pro", "enterprise"]),
        "source": random.choice(["ads", "organic", "referral"])
    }


def generate_e164_phone():
    # Generate a valid E.164 phone number:
    # - starts with +[1-9]
    # - 8–15 digits total
    while True:
        raw = fake.phone_number()
        digits = re.sub(r'\D', '', raw)
        if len(digits) >= 8 and len(digits) <= 15 and digits[0] != '0':
            return f"+{digits}"


@click.command()
@click.option('--count', default=500, help='Number of customers to generate')
@click.option('--output', default='customers.csv', help='Output CSV file')
def generate_customers(count, output):
    """Generate fake customer data and write to CSV"""

    metadata_headers = [f"metadata.{k}" for k in METADATA_KEYS]
    headers = ['uuid', 'name', 'email', 'phone',
               'description', 'tags'] + metadata_headers

    with open(output, mode='w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()

        for _ in range(count):
            metadata = generate_metadata()
            row = {
                "uuid": str(uuid.uuid4()),
                "name": fake.name(),
                "email": fake.email(),
                "phone": generate_e164_phone(),
                "description": fake.sentence(nb_words=6),
                "tags": generate_tags(),
                **{f"metadata.{k}": metadata[k] for k in METADATA_KEYS}
            }
            writer.writerow(row)

    click.echo(f"✅ Generated {count} customers to {output}")


if __name__ == '__main__':
    generate_customers()
